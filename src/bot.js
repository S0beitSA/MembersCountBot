import { fetchAndSaveGroups, saveDailyStats, getAllGroups, saveSelectedGroup, getSelectedGroups, savePreviousData, getPreviousData } from './db.js';
import { fetchGroupMetadata } from './group.js';

export const CONFIG = {
    timeoutDuration: 10 * 60 * 1000,
    scheduleTime: ['59 23 * * *', '0 8 * * *', '0 13 * * *', '0 18 * * *'],
    commands: {
        participants: '@participantes',
        select: '@selecionargrupo',
        remove: '@removerid',
    },
    regex: {
        updescontaUrl: /https:\/\/updesconta\.com\.br.*/
    },
    operations: {
        select: {
            successMessage: 'Grupo salvo para verificação agendada.',
        },
    },
};

export const handleGroupOperation = async (sock, chatId, operation) => {
    const metadata = await fetchGroupMetadata(sock, chatId); // Use a função de tentativas
    if (!metadata) return;

    const { id: groupId, subject: groupName } = metadata;
    saveSelectedGroup(groupId, groupName);

    if (operation.successMessage) {
        await sock.sendMessage(chatId, { text: operation.successMessage });
    }
};

export const handleParticipantCount = async (sock) => {
    console.log('Executando contagem de participantes...');
    const groupsObject = await sock.groupFetchAllParticipating();
    const groupsArray = Object.values(groupsObject);

    console.log('Grupos retornados:', groupsArray.map(group => group.subject));

    fetchAndSaveGroups(groupsArray); 

    const allGroups = getAllGroups();
    const previousData = getPreviousData();

    const todayDate = new Date().toLocaleDateString('pt-BR');
    let totalParticipants = 0;
    let totalEntries = 0;
    let totalExits = 0;
    let messageContent = '';

    for (const group of allGroups) {
        try {
            const metadata = await fetchGroupMetadata(sock, group.id); 
            const currentParticipants = metadata.participants.map(p => p.id);
            const previousParticipants = previousData[group.id]?.participants || [];

            const newEntries = currentParticipants.filter(id => !previousParticipants.includes(id));
            const newExits = previousParticipants.filter(id => !currentParticipants.includes(id));

            totalParticipants += currentParticipants.length;
            totalEntries += newEntries.length;
            totalExits += newExits.length;

            messageContent += `-----------------------------\n` +
                              `Grupo: ${group.name}\n` +
                              `Total de Participantes: ${currentParticipants.length}\n` +
                              `Entradas hoje: ${newEntries.length}\n` +
                              `Saídas hoje: ${newExits.length}\n`;

            savePreviousData(group.id, currentParticipants);
            saveDailyStats(group.id, currentParticipants.length, todayDate);
        } catch (error) {
            console.error(`Erro ao processar grupo ${group.id}:`, error);
        }
    }

    const summary = `Resumo do dia ${todayDate}:\n` +
                    `Total de participantes: ${totalParticipants}\n` +
                    `Total de entradas hoje: ${totalEntries}\n` +
                    `Total de saídas hoje: ${totalExits}\n` +
                    `-----------------------------\n`;

    messageContent = summary + messageContent;

    const selectedGroups = getSelectedGroups();
    for (const group of selectedGroups) {
        try {
            await sock.sendMessage(group.id, { text: messageContent });
            console.log(`Mensagem enviada para o grupo: ${group.name || group.id}`);
        } catch (error) {
            console.error(`Erro ao enviar mensagem para o grupo ${group.name || group.id}:`, error);
        }
    }
};

