import Database from 'better-sqlite3';

const db = new Database('countbot.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT
    );
    CREATE TABLE IF NOT EXISTS selected_groups (
        id TEXT PRIMARY KEY,
        name TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_counters (
        group_id TEXT,
        date TEXT,
        entries INTEGER DEFAULT 0,
        exits INTEGER DEFAULT 0,
        created_at TEXT,
        PRIMARY KEY (group_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_counters_date ON daily_counters(date);
`);

export const fetchAndSaveGroups = (groups) => {
    const insertGroup = db.prepare('INSERT OR IGNORE INTO groups (id, name) VALUES (?, ?)');

    const transaction = db.transaction((groups) => {
        for (const group of groups) {
            const groupName = group.subject?.trim().toLowerCase();
            
            if (!groupName || !groupName.startsWith('offertando')) {
                console.log(`Ignorando grupo: ${group.subject}`);
                continue;
            }

            console.log(`Processando grupo: ${group.subject}`);
            insertGroup.run(group.id, group.subject || 'Unknown');
        }
    });

    try {
        transaction(groups);
    } catch (error) {
        console.log('Erro ao salvar grupos:', error);
    }
};

export const saveDailyStats = (groupId, participantCount, date) => {
    const insertDailyStat = db.prepare('INSERT INTO daily_stats (group_id, participant_count, date) VALUES (?, ?, ?)');
    insertDailyStat.run(groupId, participantCount, date);
};

export const getGroupDetails = (groupId) => {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    return { group };
};

export const getAllGroups = () => {
    return db.prepare('SELECT * FROM groups').all();
};

export const saveSelectedGroup = (groupId, groupName) => {
    const insertSelectedGroup = db.prepare('INSERT OR IGNORE INTO selected_groups (id, name) VALUES (?, ?)');
    insertSelectedGroup.run(groupId, groupName);
};

export const getSelectedGroups = () => {
    return db.prepare('SELECT * FROM selected_groups').all();
};

export const savePreviousData = (date, groupId, participants) => {
    const insertPreviousData = db.prepare(`
        INSERT INTO previous_data (group_id, date, participants)
        VALUES (?, ?, ?)
        ON CONFLICT(group_id, date) DO UPDATE SET participants = excluded.participants
    `);
    insertPreviousData.run(groupId, date, JSON.stringify(participants));
};

export const getPreviousData = (date) => {
    const rows = db.prepare('SELECT * FROM previous_data WHERE date = ?').all(date);
    const data = {};
    rows.forEach(row => {
        if (row.group_id && row.participants) {
            data[row.group_id] = JSON.parse(row.participants);
        }
    });
    return data;
};

export const saveDailyMovements = (groupId, date, entries, exits) => {
    const stmt = db.prepare(`
        INSERT INTO daily_movements (group_id, date, entries, exits)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(group_id, date) 
        DO UPDATE SET 
            entries = json_patch(COALESCE(daily_movements.entries, '[]'), ?),
            exits = json_patch(COALESCE(daily_movements.exits, '[]'), ?)
    `);
    stmt.run(groupId, date, JSON.stringify(entries), JSON.stringify(exits), JSON.stringify(entries), JSON.stringify(exits));
};

export const getDailyMovements = (date) => {
    const rows = db.prepare('SELECT * FROM daily_movements WHERE date = ?').all(date);
    const data = {};
    rows.forEach(row => {
        if (row.group_id) {
            data[row.group_id] = {
                entries: JSON.parse(row.entries || '[]'),
                exits: JSON.parse(row.exits || '[]')
            };
        }
    });
    return data;
};

export const incrementCounter = (groupId, date, type) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO daily_counters (group_id, date, entries, exits, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(group_id, date) 
        DO UPDATE SET 
            ${type} = daily_counters.${type} + 1,
            created_at = ?
        WHERE date = ? /* Garante que só atualiza registros do dia atual */
    `);
    
    stmt.run(
        groupId, 
        date, 
        type === 'entries' ? 1 : 0, 
        type === 'exits' ? 1 : 0, 
        now,
        now,
        date
    );
};

export const getDailyCounters = (date) => {
    return db.prepare(`
        SELECT group_id, entries, exits 
        FROM daily_counters 
        WHERE date = ?
        ORDER BY created_at DESC
    `).all(date);
};

export const initializeNewDay = (date) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO daily_counters (group_id, date, entries, exits, created_at)
        SELECT id, ?, 0, 0, ? 
        FROM groups
    `);
    stmt.run(date, now);
    console.log(`Contadores inicializados para o dia ${date}`);
};
