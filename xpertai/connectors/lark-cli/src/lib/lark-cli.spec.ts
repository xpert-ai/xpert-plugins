import { larkCli } from './lark-cli.js';

describe('larkCli', () => {
  it('should work', () => {
    expect(larkCli()).toEqual('lark-cli');
  })
})
