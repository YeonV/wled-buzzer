import { io } from 'socket.io-client';
import { BACKEND_URL } from '../utils/viewMode';

const socket = io(BACKEND_URL, { autoConnect: true });
window.socket = socket;

export default socket;
