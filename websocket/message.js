const conversationsClients = new Map(); // Clé: conversationId, Valeur: Set<WebSocket>
const lobbyClients = new Set(); // Set de tous les WebSockets dans le lobby

// Nouvelle Map pour associer un WebSocket à son userId (pour cibler les notifications)
// Clé: WebSocket, Valeur: userId
const wsToUserIdMap = new Map();


/**
 * Gère l'événement 'joinConversation'.
 * @param {WebSocket} ws La connexion WebSocket du client.
 * @param {any} conversationId L'ID de la conversation à rejoindre.
 * @param {string} clientIp L'adresse IP du client.
 * @param {number} userId L'ID de l'utilisateur qui se connecte (nouveau paramètre).
 */
function handleJoinConversation(ws, conversationId, clientIp, userId) {
    if (typeof conversationId === 'number' || typeof conversationId === 'string') {
        // ... (code existant pour retirer des autres conversations) ...
        conversationsClients.forEach((clientsSet, convId) => {
            if (clientsSet.has(ws)) {
                clientsSet.delete(ws);
                console.log(`Client ${clientIp} a quitté la conversation ${convId}`);
            }
        });

        if (lobbyClients.has(ws)) {
            lobbyClients.delete(ws);
            console.log(`Client ${clientIp} a quitté le lobby pour rejoindre la conversation ${conversationId}`);
        }

        if (!conversationsClients.has(conversationId)) {
            conversationsClients.set(conversationId, new Set());
        }
        conversationsClients.get(conversationId).add(ws);
        console.log(`Client ${clientIp} (User ID: ${userId}) a rejoint la conversation ${conversationId}. Total dans cette conv: ${conversationsClients.get(conversationId).size}`);

        wsToUserIdMap.set(ws, userId); // Associe le WebSocket à l'ID utilisateur
        ws.send(JSON.stringify({ event: 'joinedConversation', data: conversationId }));
    } else {
        console.warn(`ID de conversation invalide reçu pour joinConversation de ${clientIp}:`, conversationId);
        ws.send(JSON.stringify({ event: 'joinConversationError', message: 'ID de conversation invalide.' }));
    }
}

/**
 * Gère l'événement 'sendMessage'.
 * @param {WebSocket} ws La connexion WebSocket du client qui envoie le message.
 * @param {Object} messageData Les données du message (token, conversationId, senderId, content, type).
 * @param {string} apiBaseUrl L'URL de base de l'API Laravel.
 */
async function handleSendMessage(ws, messageData, apiBaseUrl) {
    const { token, conversationId, senderId, content, type, media_url, thumbnail_url, metadata } = messageData;

    if (!conversationId || !senderId || !token) {
        console.warn('Données de message manquantes ou incomplètes:', messageData);
        ws.send(JSON.stringify({ event: 'sendMessageError', message: 'Données de message manquantes (conversationId, senderId, content, ou token).' }));
        return;
    }

    console.log(`Message reçu pour la conversation ${conversationId} de l'utilisateur ${senderId}: ${content}`);

    try {
        const laravelApiEndpoint = `${apiBaseUrl}/messages`;

        const response = await fetch(laravelApiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': "Socket-Chat-Dispatch V1"
            },
            body: JSON.stringify({
                conversation_id: conversationId,
                user_id: senderId,
                content: content,
                type: type || 'text',
                media_url: media_url,
                thumbnail_url: thumbnail_url,
                metadata: metadata
            }),
        });

        const apiResponse = await response.json();

        if (!response.ok) {
            console.error('Erreur de sauvegarde Laravel:', apiResponse.message || apiResponse.errors);
            throw new Error(apiResponse.message || (apiResponse.errors ? JSON.stringify(apiResponse.errors) : 'Erreur inconnue de Laravel'));
        }

        const savedMessage = apiResponse.data; // Le message sauvegardé par Laravel

        // Assurez-vous que Laravel renvoie 'participant_user_ids'
        const participantUserIds = savedMessage.participant_user_ids || [];
        if (participantUserIds.length === 0) {
            console.warn(`Aucun ID de participant trouvé dans la réponse Laravel pour la conversation ${conversationId}.`);
        }

        // 1. Émettre le message à tous les clients dans la même conversation (chat actifs)
        const clientsInConversation = conversationsClients.get(conversationId);
        if (clientsInConversation) {
            clientsInConversation.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ event: 'newMessage', data: savedMessage }));
                }
            });
            console.log(`Message émis à ${clientsInConversation.size} clients dans la conversation ${conversationId}`);
        }

        // 2. Émettre une notification de mise à jour aux clients sur la page des conversations (lobby)
        // CIBLER UNIQUEMENT LES PARTICIPANTS DE LA CONVERSATION
        lobbyClients.forEach(client => {
            const clientUserId = wsToUserIdMap.get(client); // Récupérer l'ID de l'utilisateur associé au WS
            if (client.readyState === WebSocket.OPEN && clientUserId && participantUserIds.includes(clientUserId)) {
                // Envoyer un signal général pour dire "une conversation a été mise à jour".
                client.send(JSON.stringify({
                    event: 'conversationListUpdated',
                    data: { conversationId: conversationId }
                }));
            }
        });
        console.log(`Notification 'conversationListUpdated' ciblée émise aux participants du lobby.`);

    } catch (error) {
        console.error("Erreur lors de la sauvegarde/émission du message :", error.message);
        ws.send(JSON.stringify({ event: 'sendMessageError', message: 'Échec de l\'envoi du message: ' + error.message }));
    }
}

/**
 * Gère l'ajout d'un client au "lobby".
 * @param {WebSocket} ws La connexion WebSocket du client.
 * @param {string} clientIp L'adresse IP du client (pour le logging).
 * @param {number} userId L'ID de l'utilisateur qui se connecte (nouveau paramètre).
 */
function handleJoinLobby(ws, clientIp, userId) {
    // ... (code existant pour retirer des conversations spécifiques) ...
    conversationsClients.forEach((clientsSet, convId) => {
        if (clientsSet.has(ws)) {
            clientsSet.delete(ws);
            console.log(`Client ${clientIp} a quitté la conversation ${convId} pour le lobby.`);
        }
    });

    if (!lobbyClients.has(ws)) {
        lobbyClients.add(ws);
        wsToUserIdMap.set(ws, userId); // Associe le WebSocket à l'ID utilisateur
        console.log(`Client ${clientIp} (User ID: ${userId}) a rejoint le lobby. Total: ${lobbyClients.size}`);
    }
    ws.send(JSON.stringify({ event: 'joinedLobby', message: 'Vous êtes maintenant abonné aux mises à jour des conversations.' }));
}

/**
 * Retire un client de toutes les conversations et du lobby lors de sa déconnexion.
 * @param {WebSocket} ws La connexion WebSocket du client.
 * @param {string} clientIp L'adresse IP du client (pour le logging).
 */
function removeClientFromAllConversationsAndLobby(ws, clientIp) {
    // ... (code existant pour retirer des conversations spécifiques) ...
    conversationsClients.forEach((clientsSet, convId) => {
        if (clientsSet.has(ws)) {
            clientsSet.delete(ws);
            console.log(`Client ${clientIp} supprimé de la conversation ${convId}.`);
            if (clientsSet.size === 0) {
                conversationsClients.delete(convId);
            }
        }
    });
    if (lobbyClients.has(ws)) {
        lobbyClients.delete(ws);
        console.log(`Client ${clientIp} supprimé du lobby. Restant: ${lobbyClients.size}`);
    }
    wsToUserIdMap.delete(ws); // Supprime l'association userId du WebSocket
    console.log(`Association User ID pour ${clientIp} supprimée.`);
}

module.exports = {
    handleJoinConversation,
    handleSendMessage,
    handleJoinLobby,
    removeClientFromAllConversations: removeClientFromAllConversationsAndLobby,
};