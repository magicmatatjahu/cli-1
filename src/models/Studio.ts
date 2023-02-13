import { existsSync, promises as fPromises } from 'fs';
import { SpecificationFileNotFound } from '../errors/specification-file';
import { createServer } from 'http';
import serveHandler from 'serve-handler';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import open from 'open';

export type StudioStartOptions = {
  filePath: string;
  port?: number;
  remote?: boolean;
  remoteAddress?: string;
}

const { readFile, writeFile } = fPromises;

const sockets: any[] = [];
const messageQueue: string[] = [];

export const DEFAULT_PORT = 3210;
export const DEFAULT_REMOTE_ADDRESS = 'https://studio.asyncapi.com';

function isValidFilePath(filePath: string): boolean {
  return existsSync(filePath);
}

export function start(options: StudioStartOptions): void {
  const filePath = options.filePath;
  const port = options.port || DEFAULT_PORT;
  const remote = options.remote;
  const remoteAddress = options.remoteAddress || DEFAULT_REMOTE_ADDRESS;

  if (!isValidFilePath(filePath)) {
    throw new SpecificationFileNotFound(filePath);
  }

  chokidar.watch(filePath).on('all', (event, path) => {
    switch (event) {
    case 'add':
    case 'change':
      getFileContent(path).then(code => {
        messageQueue.push(JSON.stringify({
          type: 'file:changed',
          code,
        }));
        sendQueuedMessages();
      });
      break;
    case 'unlink':
      messageQueue.push(JSON.stringify({
        type: 'file:deleted',
        filePath,
      }));
      sendQueuedMessages();
      break;
    }
  });

  if (!remote) {
    return runLocalServer(filePath, port);
  }
  return runRemoteServer(filePath, port, remoteAddress)
}

function runLocalServer(filePath: string, port: number) {
  let studioBuildIndex: string;
  try {
    studioBuildIndex = require.resolve('@asyncapi/studio/build/index.html');
    studioBuildIndex = studioBuildIndex.replace('/index.html', '')
  } catch(err) {
    console.error('Cannot recognize location of the @asyncapi/studio package.', err);
    throw err;
  }

  const server = createServer((request, response) => {
    return serveHandler(request, response, {
      public: studioBuildIndex,
    });
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/live-server') {
      wsServer.handleUpgrade(request, socket, head, (sock: any) => {
        wsServer.emit('connection', sock, request);
      });
    } else {
      socket.destroy();
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  establishWsServer(wsServer, filePath);

  server.listen(port, () => {
    const url = `http://localhost:${port}?liveServer=${port}`;
    console.log(`Studio is running at ${url}`);
    console.log(`Watching changes on file ${filePath}`);
    open(url);
  });
}

function runRemoteServer(filePath: string, port: number, remoteAddress: string) {
  const server = createServer();
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/live-server') {
      wsServer.handleUpgrade(request, socket, head, (sock: any) => {
        wsServer.emit('connection', sock, request);
      });
    } else {
      socket.destroy();
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  establishWsServer(wsServer, filePath);

  server.listen(port, () => {
    const url = `${remoteAddress}?liveServer=${port}`;
    console.log(`Studio is running at ${url}`);
    console.log(`Watching changes on file ${filePath}`);
    open(url);
  });
}

function establishWsServer(wsServer: WebSocketServer, filePath: string) {
  wsServer.on('close', (socket: any) => {
    sockets.splice(sockets.findIndex(s => s === socket));
  });

  wsServer.on('connection', (socket: any) => {
    sockets.push(socket);
    getFileContent(filePath).then((code: string) => {
      messageQueue.push(JSON.stringify({
        type: 'file:loaded',
        code,
      }));
      sendQueuedMessages();
    });

    socket.on('message', (event: string) => {
      try {
        const json:any = JSON.parse(event);
        if (json.type === 'file:update') {
          saveFileContent(filePath, json.code);
        } else {
          console.warn('Live Server: An unknown event has been received. See details:');
          console.log(json);
        }
      } catch (e) {
        console.error(`Live Server: An invalid event has been received. See details:\n${event}`);
      }      
    });
  });
}

function sendQueuedMessages() {
  while (messageQueue.length && sockets.length) {
    const nextMessage = messageQueue.shift();
    for (const socket of sockets) {
      socket.send(nextMessage);
    }
  }
}

function getFileContent(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    readFile(filePath, { encoding: 'utf8' })
      .then((code: string) => {
        resolve(code);
      })
      .catch(console.error);
  });
}

function saveFileContent(filePath: string, fileContent: string): void {
  writeFile(filePath, fileContent, { encoding: 'utf8' })
    .catch(console.error);
}
