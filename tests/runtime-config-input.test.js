import {test,expect} from 'vitest';
import {readRuntimeConfiguration} from '../src/server/runtime-config-input.js';
test('configuración inline de Cloud Run exige un único destino y rechaza ausencia o ambigüedad',async()=>{
  expect(await readRuntimeConfiguration({FORX_CONFIG_JSON:'{"environment":"production"}'})).toEqual({environment:'production'});
  await expect(readRuntimeConfiguration({})).rejects.toThrow();
  await expect(readRuntimeConfiguration({FORX_CONFIG_JSON:'{}',FORX_CONFIG_PATH:'/unused'})).rejects.toThrow();
  await expect(readRuntimeConfiguration({FORX_CONFIG_JSON:' '.repeat(65537)})).rejects.toThrow();
});
