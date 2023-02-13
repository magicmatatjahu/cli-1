import {Flags} from '@oclif/core';
import Command from '../../base';
import { start as startStudio } from '../../models/Studio';
import { load } from '../../models/SpecificationFile';

export default class StartStudio extends Command {
  static description = 'starts AsyncAPI Studio';

  static flags = {
    help: Flags.help({ char: 'h' }),
    file: Flags.string({ char: 'f', description: 'path to the AsyncAPI file to link with Studio' }),
    port: Flags.integer({ char: 'p', description: 'port in which to start Studio' }),
    wsPort: Flags.integer({ char: 'p', description: 'port in which to start websocket server' }),
    remote: Flags.boolean({ char: 'r', description: 'use hosted Studio' }),
    ['remote-address']: Flags.string({ description: 'remote address where Studio is hosted' }),
  };

  static args = [];

  async run() {
    const { flags } = await this.parse(StartStudio);
    const filePath = flags.file || (await load()).getFilePath();
    const remote = flags.remote;
    const remoteAddress = flags['remote-address'];

    startStudio({
      filePath: filePath as string,
      port: flags.port,
      remote,
      remoteAddress,
    });
  }
}
