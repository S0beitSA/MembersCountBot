import Database from 'better-sqlite3';

const db = new Database('countbot.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT
    );
    CREATE TABLE IF NOT EXISTS participants (
        group_id TEXT,
        participant_id TEXT,
        PRIMARY KEY (group_id, participant_id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        participant_count INTEGER,
        date TEXT,
        FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    CREATE TABLE IF NOT EXISTS selected_groups (
        id TEXT PRIMARY KEY,
        name TEXT
    );
    CREATE TABLE IF NOT EXISTS previous_data (
        group_id TEXT PRIMARY KEY,
        participants TEXT
    );
`);

export const fetchAndSaveGroups = (groups) => {
    const insertGroup = db.prepare('INSERT OR IGNORE INTO groups (id, name) VALUES (?, ?)');
    const insertParticipant = db.prepare('INSERT OR IGNORE INTO participants (group_id, participant_id) VALUES (?, ?)');
    const deleteParticipants = db.prepare('DELETE FROM participants WHERE group_id = ?');

    for (const group of groups) {
        // Normaliza o nome do grupo para evitar problemas com capitalização ou espaços extras
        const groupName = group.subject?.trim().toLowerCase();

        if (!groupName || !groupName.startsWith('offertando -')) {
            console.log(`Ignorando grupo: ${group.subject}`);
            continue;
        }

        console.log(`Salvando grupo: ${group.subject}`);
        insertGroup.run(group.id, group.subject || 'Unknown');
        deleteParticipants.run(group.id);
        for (const participant of group.participants) {
            insertParticipant.run(group.id, participant.id);
        }
    }
};

export const saveDailyStats = (groupId, participantCount, date) => {
    const insertDailyStat = db.prepare('INSERT INTO daily_stats (group_id, participant_count, date) VALUES (?, ?, ?)');
    insertDailyStat.run(groupId, participantCount, date);
};

export const getGroupDetails = (groupId) => {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    const participants = db.prepare('SELECT participant_id FROM participants WHERE group_id = ?').all(groupId);
    return { group, participants };
};

export const getAllGroups = () => {
    const groups = db.prepare('SELECT * FROM groups').all();
    return groups.map(group => {
        const participants = db.prepare('SELECT participant_id FROM participants WHERE group_id = ?').all(group.id);
        return { ...group, participants };
    });
};

export const saveSelectedGroup = (groupId, groupName) => {
    const insertSelectedGroup = db.prepare('INSERT OR IGNORE INTO selected_groups (id, name) VALUES (?, ?)');
    insertSelectedGroup.run(groupId, groupName);
};

export const getSelectedGroups = () => {
    return db.prepare('SELECT * FROM selected_groups').all();
};

export const savePreviousData = (groupId, participants) => {
    const insertPreviousData = db.prepare(`
        INSERT INTO previous_data (group_id, participants)
        VALUES (?, ?)
        ON CONFLICT(group_id) DO UPDATE SET participants = excluded.participants
    `);
    insertPreviousData.run(groupId, JSON.stringify(participants));
};

export const getPreviousData = () => {
    const rows = db.prepare('SELECT * FROM previous_data').all();
    const data = {};
    rows.forEach(row => {
        if (row.group_id && row.participants) {
            data[row.group_id] = { participants: JSON.parse(row.participants) };
        }
    });
    return data;
};