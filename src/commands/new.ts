import {Flags} from '@oclif/core';
import { promises as fPromises } from 'fs';
import Command from '../base';
import * as inquirer from 'inquirer';
import { start as startStudio, DEFAULT_PORT } from '../models/Studio';
import { resolve } from 'path';

const { writeFile, readFile } = fPromises;
const DEFAULT_ASYNCAPI_FILE_NAME = 'asyncapi.yaml';
const DEFAULT_ASYNCAPI_TEMPLATE = 'default-example.yaml';

export default class New extends Command {
  static description = 'Creates a new asyncapi file';

  static flags = {
    help: Flags.help({ char: 'h' }),
    'file-name': Flags.string({ char: 'n', description: 'name of the file' }),
    example: Flags.string({ char: 'e', description: 'name of the example to use' }),
    studio: Flags.boolean({ char: 's', description: 'open in Studio' }),
    port: Flags.integer({ char: 'p', description: 'port in which to start Studio' }),
    'remote-address': Flags.string({ char: 'r', description: 'remote address on which the Studio is hosted' }),
    'no-tty': Flags.boolean({ description: 'do not use an interactive terminal' }),
  };

  static args = [];

  async run() {
    const { flags } = await this.parse(New); // NOSONAR
    const isTTY = process.stdout.isTTY;

    if (!flags['no-tty'] && isTTY) {
      return this.runInteractive();
    }

    const fileName = flags['file-name'] || DEFAULT_ASYNCAPI_FILE_NAME;
    const template = flags['example'] || DEFAULT_ASYNCAPI_TEMPLATE;

    await this.createAsyncapiFile(fileName, template);

    if (flags.studio) {
      if (isTTY) {
        startStudio({
          filePath: fileName,
          port: flags.port,
        });
      } else {
        this.warn('Warning: --studio flag was passed but the terminal is not interactive. Ignoring...');
      }
    }
  }

  /* eslint-disable sonarjs/cognitive-complexity */
  async runInteractive() { // NOSONAR
    const { flags } = await this.parse(New); // NOSONAR
    let fileName = flags['file-name'];
    let selectedTemplate = flags['example'];
    let openStudio = flags.studio;
    let examples = [];

    const questions = [];

    if (!fileName) {
      questions.push({
        name: 'filename',
        message: 'name of the file?',
        type: 'input',
        default: DEFAULT_ASYNCAPI_FILE_NAME,
      });
    }

    try {
      const exampleFiles = await readFile(resolve(__dirname, '../../assets/examples/examples.json'), { encoding: 'utf8' });
      examples = JSON.parse(exampleFiles);
    } catch (error) {
      // no examples found
    }

    if (!selectedTemplate && examples.length > 0) {
      questions.push({
        name: 'use-example',
        message: 'would you like to start your new file from one of our examples?',
        type: 'confirm',
        default: true,
      });
      questions.push({
        type: 'list',
        name: 'selectedTemplate',
        message: 'What example would you like to use?',
        choices: examples,
        when: (answers: any) => {
          return answers['use-example'];
        },
      });
    }

    if (openStudio === undefined) {
      questions.push({
        name: 'studio',
        message: 'open in Studio?',
        type: 'confirm',
        default: true,
      });
    }

    if (questions.length) {
      const answers: any = await inquirer.prompt(questions);

      if (!fileName) {fileName = answers.filename as string;}
      if (!selectedTemplate) {selectedTemplate = answers.selectedTemplate as string;}
      if (openStudio === undefined) {openStudio = answers.studio;}
    } 

    fileName = fileName || DEFAULT_ASYNCAPI_FILE_NAME;
    selectedTemplate = selectedTemplate || DEFAULT_ASYNCAPI_TEMPLATE;

    await this.createAsyncapiFile(fileName, selectedTemplate);
    if (openStudio) { 
      startStudio({
        filePath: fileName,
        port: flags.port,
      });
    }
  }

  async createAsyncapiFile(fileName:string, selectedTemplate:string) {
    const asyncApiFile = await readFile(resolve(__dirname, '../../assets/examples/', selectedTemplate), { encoding: 'utf8' });

    const fileNameHasFileExtension = fileName.includes('.');
    const fileNameToWriteToDisk = fileNameHasFileExtension ? fileName : `${fileName}.yaml`;

    try {
      const content = await readFile(fileNameToWriteToDisk, { encoding: 'utf8' });
      if (content !== '') {
        console.log(`File ${fileNameToWriteToDisk} already exists. Ignoring...`);
        return;
      }
    } catch (e) {
      // File does not exist. Proceed creating it...
    }
    
    await writeFile(fileNameToWriteToDisk, asyncApiFile, { encoding: 'utf8' });
    console.log(`Created file ${fileNameToWriteToDisk}...`);
  }
}
