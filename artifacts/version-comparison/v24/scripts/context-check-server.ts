// Isolated test server: leave the user's live session on 3000/3001 intact.
import {createServers} from '../src/server.js';
const servers=createServers(3940,3941,undefined,{ownedFixtures:true});
servers.app.listen(3940,'127.0.0.1');
servers.merchant.listen(3941,'127.0.0.1');
