const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Remplace socket.io

const PORT = process.env.PORT || 3000;

// Servez un fichier HTML pour tester dans un navigateur
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pour stocker tous les clients connectés
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('✅ Un client WebSocket est connecté');
  clients.add(ws);

  // Écoute les messages entrants
  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data);

      if (parsed.event === 'chat message') {
        console.log(`📨 Message reçu : ${parsed.data}`);

        // Réémettre à tous les clients
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              event: 'chat',
              data: parsed.data
            }));
          }
        }
      }
    } catch (e) {
      console.error('Erreur de parsing JSON :', e);
    }
  });


  ws.on('close', () => {
    console.log('❌ Un client s’est déconnecté');
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur WebSocket en écoute sur le port ${PORT}`);
});
