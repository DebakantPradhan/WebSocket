import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

function createRoom() {
	const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
	console.log(`Created room: ${roomId}`);
	return roomId;
}

interface SocketInfo {
	username: string;
	// "roomId": string,			//actually stored in map key
	socket: WebSocket;
}

interface userMessage {
	messageType: 'join' | 'createRoom' | 'chat';
	payload?: {
		username?: string;
		roomId?: string;
		message?: string;
	};
}

interface serverMessage {
	messageType: 'connection' | 'chat' | 'joined' | 'error' | 'rejoin';
	payload: {
		roomId?: string;
		username?:string;
		message?: string;
		timestamp?: string;
	};
}

type AllSocket = Map<string, SocketInfo[]>;

let allSockets: AllSocket = new Map<string, SocketInfo[]>();
let num = 0
wss.on('connection', (socket) => {
	num++;
	console.log('new client connected',num);
	socket.on('message', (rawData) => {
		
		// console.log(rawData.toString());

		try {
			const data = JSON.parse(rawData.toString());

			if (data.messageType === 'createRoom') {
				const roomId = createRoom();

				allSockets.set(roomId, []);
				let username
				if (data.payload?.username) {
					username = data.payload.username
					allSockets.get(roomId)!.push({
						username: data.payload.username,
						socket: socket,
					});
				}

				const response: serverMessage = {
					messageType: 'connection',
					payload: {
						roomId: roomId,
						username: username
					},
				};

				socket.send(JSON.stringify(response));
			}

			if (data.messageType === 'join') {
				const roomId = data.payload.roomId;
				const username = data.payload?.username;
				const timestamp = new Date().toISOString();

				if (!roomId || !username) {
					socket.send(
						JSON.stringify({
							messageType: 'error',
							payload: { message: 'Missing roomId or username' },
						})
					);
					return;
				}

				if (!allSockets.has(roomId)) {
					socket.send(
						JSON.stringify({
							messageType: 'error',
							payload: { message: `Room ${roomId} does not exist` },
						})
					);
					return;
				}

				// Check if user already in room
                const roomUsers = allSockets.get(roomId)!;
                const existingUser = roomUsers.find(user => user.socket === socket);

				if (existingUser) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: 'Already in this room' }
                    }));
                    return;
                }

				// Add user to room
                roomUsers.push({
                    username: username,
                    socket: socket
                });

				console.log(`${username} joined room ${roomId}`);

				socket.send(JSON.stringify({
                    messageType: 'joined',
                    payload: { 
                        roomId: roomId,
                        message: `Successfully joined room ${roomId}` 
                    }
                }));

				 // Notify others in room
                broadcastToRoom(roomId, `${username} joined the room`,timestamp, socket);
			}

			if (data.messageType == 'chat') {
				const roomId = data.payload.roomId;
				const username = data.payload?.username;
                const message = data.payload?.message;
				const roomUsers = allSockets.get(roomId as string);
			    const timestamp = new Date().toISOString(); // Add server timestamp


				if (!roomId || !username || !message) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: 'Missing required chat data' }
                    }));
                    return;
                }

				// Check if room exists
                if (!allSockets.has(roomId)) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: `Room ${roomId} does not exist` }
                    }));
                    return;
                }

				 // Broadcast message to all users in room (including sender)
                broadcastToRoom(roomId, `${username}: ${message}`,timestamp);
					
			}

			// Update the rejoin handler (around line 147):
			if (data.messageType === 'rejoin') {
				const { username, roomId } = data.payload;
				const timestamp = new Date().toISOString();
				
				if (!roomId || !username) {
					socket.send(JSON.stringify({
						messageType: 'error',
						payload: { message: 'Missing username or roomId for rejoin' }
					}));
					return;
				}
				
				if (allSockets.has(roomId)) {
					// Check if user already exists in room (prevent duplicates)
					const roomUsers = allSockets.get(roomId)!;
					const existingUser = roomUsers.find(user => user.username === username);
					
					if (existingUser) {
						// Update the socket reference for existing user
						existingUser.socket = socket;
					} else {
						// Add new user to existing room
						roomUsers.push({ username, socket });
					}
					
					socket.send(JSON.stringify({ 
						messageType: 'rejoined', 
						payload: { roomId, username } 
					}));

					broadcastToRoom(roomId, `${username} rejoined the room`,timestamp)
					console.log(`${username} rejoined room ${roomId}`);
				} else {
					socket.send(JSON.stringify({ 
						messageType: 'error', 
						payload: { message: 'Room not found' } 
					}));
				}
			}
		} catch (error) {
			console.error('JSON Parse Error:', error);
            socket.send(JSON.stringify({
                messageType: 'error',
                payload: { message: 'Invalid JSON format' }
            }));
		}
	});

	socket.on('error', console.error);

	socket.on('close', () => {
        console.log('Client disconnected');

        setTimeout(() => {
			removeSocketFromAllRooms(socket);
		}, 10000); 
    });

	// socket.on('message', function message(data) {
	// 	console.log('received: %s', data);
	// 	for (const skt of allSockets) {
	// 		skt.send(`from user:${data}`);
	// 	}
	// });

	// socket.on('disconnect', () => {
	// 	allSockets = allSockets.filter((x) => x != socket);
	// });
});

// Helper function to broadcast message to all users in a room
// function broadcastToRoom(roomId: string, message: string, excludeSocket?: WebSocket) {
//     const roomUsers = allSockets.get(roomId);
//     if (!roomUsers) return;

//     roomUsers.forEach(user => {
//         if (user.socket.readyState === WebSocket.OPEN && user.socket !== excludeSocket) {
//             user.socket.send(JSON.stringify({
//                 messageType: 'chat',
//                 payload: { message: message }
//             }));
//         }
//     });
// }

// Replace the existing broadcastToRoom function:
function broadcastToRoom(roomId: string, message: string, timestamp?: string, excludeSocket?: WebSocket) {
    const roomUsers = allSockets.get(roomId);
    if (!roomUsers) return;

    roomUsers.forEach(user => {
        if (user.socket.readyState === WebSocket.OPEN && user.socket !== excludeSocket) {
            user.socket.send(JSON.stringify({
                messageType: 'chat',
                payload: { 
                    message: message,
                    timestamp: timestamp || new Date().toISOString() // Add timestamp
                }
            }));
        }
    });
}

// Helper function to remove socket from all rooms when disconnected

function removeSocketFromAllRooms(socket: WebSocket) {
    allSockets.forEach((users, roomId) => {
        const userToRemove = users.find(user => user.socket === socket);
        if (userToRemove) {
            // Check if socket is still closed (not reconnected)
            if (socket.readyState === WebSocket.CLOSED) {
                // Remove user from room
                const updatedUsers = users.filter(user => user.socket !== socket);
                
                if (updatedUsers.length === 0) {
                    // Delete empty room
                    allSockets.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                } else {
                    allSockets.set(roomId, updatedUsers);
                    // Notify remaining users
                    broadcastToRoom(roomId, `${userToRemove.username} left the room`);
                }
            }
        }
    });
}
