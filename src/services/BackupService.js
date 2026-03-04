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
            const interval = cronParser.parseExpression(this.config.schedule);
            const nextDate = interval.next().toDate();
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