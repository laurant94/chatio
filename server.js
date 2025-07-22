const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // Ajoute cette ligne

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000; // Utilise le port 3000 par défaut ou celui défini par l'environnement

// Route de base pour vérifier que le serveur HTTP fonctionne
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // Va chercher le fichier dans le dossier public
});

// Événements Socket.IO
io.on('connection', (socket) => {
  console.log(`Un utilisateur s'est connecté : ${socket.id}`);

  // Écoute l'événement 'chat message'
  socket.on('chat message', (msg) => {
    console.log(`Message reçu de ${socket.id}: ${msg}`);
    // Diffuse le message à tous les clients connectés
    io.emit('chat message', msg);
  });

  // Gère la déconnexion
  socket.on('disconnect', () => {
    console.log(`L'utilisateur ${socket.id} s'est déconnecté`);
  });
});

// Démarre le serveur
server.listen(PORT, () => {
  console.log(`Serveur Socket.IO démarré sur le port :${PORT}`);
});