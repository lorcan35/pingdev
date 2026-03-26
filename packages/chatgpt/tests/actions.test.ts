import { describe, it, expect } from 'vitest';

describe('chatgpt PingApp', () => {
  describe('sendMessage', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['sendMessage']).toBeDefined();
    });
  });

  describe('addPhotos', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['addPhotos']).toBeDefined();
    });
  });

  describe('createImage', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['createImage']).toBeDefined();
    });
  });

  describe('startVoice', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['startVoice']).toBeDefined();
    });
  });

});
