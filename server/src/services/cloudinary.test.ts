import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { signUpload } from './cloudinary';

describe('signUpload', () => {
  it('assina os parâmetros em ordem alfabética com o segredo', () => {
    const env = { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' };
    const result = signUpload(env, 'profiles', 1_700_000_000_000);
    const expected = createHash('sha1')
      .update('allowed_formats=jpg,jpeg,png,webp,heic&folder=chat-firebase/profiles&timestamp=1700000000secret')
      .digest('hex');
    assert.equal(result.signature, expected);
    assert.equal(result.timestamp, 1_700_000_000);
    assert.equal(result.folder, 'chat-firebase/profiles');
  });
});
