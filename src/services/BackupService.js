const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cronParser = require('cron-parser');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '..', '..', 'backups');
        this.configFile = path.join(this.backupDir, 'config.json');
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        // Load or create default config
        this.config = this.loadConfig();
        this.task = null;
    }

    loadConfig() {
        if (fs.existsSync(this.configFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
            } catch (e) {
                console.error('Erro ao carregar config de backup:', e);
            }
        }
        
        // Default: Sunday at 03:00 AM, max 3 backups
        const defaultConfig = {
            schedule: '0 3 * * 0',
            maxBackups: 3
        };
        this.saveConfig(defaultConfig);
        return defaultConfig;
    }

    saveConfig(config) {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
            this.config = config;
        } catch (e) {
            console.error('Erro ao salvar config de backup:', e);
        }
    }

    start() {
        if (this.task) {
            this.task.stop();
        }

        console.log(`Agendando backup com cron: ${this.config.schedule}`);
        
        if (!cron.validate(this.config.schedule)) {
            console.error('Cron schedule inválido:', this.config.schedule);
            return;
        }

        this.task = cron.schedule(this.config.schedule, () => {
            console.log('Iniciando backup agendado do banco de dados...');
            this.performBackup();
        });
        
        console.log(`Serviço de backup iniciado. Próximo backup: ${this.getNextBackupDate()}`);
    }

    updateConfig(schedule, maxBackups) {
        if (schedule && !cron.validate(schedule)) {
            throw new Error('Formato Cron inválido');
        }

        const newConfig = {
            schedule: schedule || this.config.schedule,
            maxBackups: parseInt(maxBackups) || this.config.maxBackups
        };

        this.saveConfig(newConfig);
        this.start(); // Restart task with new schedule
        return newConfig;
    }

    getNextBackupDate() {
        try {
            const parts = this.config.schedule.split(' ');
            if (parts.length < 5) return 'Configuração inválida';

            const minute = parseInt(parts[0]);
            const hour = parseInt(parts[1]);
            const dayOfWeek = parts[4] === '*' ? null : parseInt(parts[4]);

            let nextDate = new Date();
            nextDate.setSeconds(0);
            nextDate.setMilliseconds(0);

            // Se já passou do horário hoje, avança para amanhã (base)
            if (nextDate.getHours() > hour || (nextDate.getHours() === hour && nextDate.getMinutes() >= minute)) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
            
            // Define o horário do backup
            nextDate.setHours(hour, minute, 0, 0);

            // Se for semanal, ajusta para o dia correto
            if (dayOfWeek !== null) {
                // Se hoje não é o dia do backup ou já passou do dia
                // Vamos encontrar o próximo dia da semana correspondente
                const currentDay = nextDate.getDay();
                let daysUntilBackup = (dayOfWeek - currentDay + 7) % 7;
                
                // Se for o mesmo dia (0), mas a data calculada (amanhã) já passou do dia alvo (hoje), 
                // então na verdade é daqui a 6 dias (porque já somamos 1 dia acima se passou da hora)
                // Mas vamos simplificar:
                
                // Reiniciar cálculo para semanal para ser mais preciso
                nextDate = new Date();
                nextDate.setSeconds(0);
                nextDate.setMilliseconds(0);
                
                // Encontrar o próximo dia da semana
                const today = nextDate.getDay();
                let diff = dayOfWeek - today;
                
                // Se o dia já passou nesta semana ou é hoje mas já passou da hora
                if (diff < 0 || (diff === 0 && (nextDate.getHours() > hour || (nextDate.getHours() === hour && nextDate.getMinutes() >= minute)))) {
                    diff += 7;
                }
                
                nextDate.setDate(nextDate.getDate() + diff);
                nextDate.setHours(hour, minute, 0, 0);
            }

            return nextDate.toLocaleString('pt-BR');
        } catch (err) {
            console.error('Erro ao calcular próxima data de backup:', err);
            return 'Data inválida ou não definida';
        }
    }

    getBackups() {
        try {
            const files = fs.readdirSync(this.backupDir);
            return files
                .filter(file => file.startsWith('backup-') && file.endsWith('.sql'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        path: filePath,
                        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                        createdAt: stats.mtime
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt); // Newest first
        } catch (e) {
            console.error('Erro ao listar backups:', e);
            return [];
        }
    }

    deleteBackup(filename) {
        const filePath = path.join(this.backupDir, filename);
        if (fs.existsSync(filePath) && filename.startsWith('backup-') && filename.endsWith('.sql')) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    async performBackup() {
        return new Promise((resolve, reject) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup-${process.env.DB_NAME}-${timestamp}.sql`;
            const filePath = path.join(this.backupDir, filename);
    
            const dbHost = process.env.DB_HOST || 'localhost';
            const dbUser = process.env.DB_USER || 'root';
            const dbPass = process.env.DB_PASSWORD ? `--password="${process.env.DB_PASSWORD}"` : '';
            const dbName = process.env.DB_NAME;
    
            const dumpCommand = `mysqldump -h ${dbHost} -u ${dbUser} ${dbPass} ${dbName} > "${filePath}"`;
    
            exec(dumpCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Erro ao criar backup: ${error.message}`);
                    reject(error);
                    return;
                }
                
                console.log(`Backup criado com sucesso: ${filename}`);
                this.rotateBackups();
                resolve(filename);
            });
        });
    }

    rotateBackups() {
        const backups = this.getBackups(); // Already sorted newest first
        
        if (backups.length > this.config.maxBackups) {
            const toDelete = backups.slice(this.config.maxBackups);
            toDelete.forEach(backup => {
                try {
                    fs.unlinkSync(backup.path);
                    console.log(`Backup antigo removido: ${backup.filename}`);
                } catch (e) {
                    console.error(`Erro ao remover backup antigo ${backup.filename}:`, e);
                }
            });
        }
    }
}

module.exports = new BackupService();