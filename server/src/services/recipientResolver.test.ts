import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDirectConversationId, parseDirectParticipants } from '../domain';
import { computeGroupRecipients } from './recipientResolver';

const members = ['owner', 'ana', 'bia', 'caio'];

describe('computeGroupRecipients', () => {
  it('all_group_messages: todos menos o remetente', () => {
    const result = computeGroupRecipients({
      policy: 'all_group_messages',
      memberIds: members,
      senderId: 'ana',
      target: { type: 'conversation' },
      mentionedUserIds: [],
    });
    assert.deepEqual(result.sort(), ['bia', 'caio', 'owner']);
  });

  it('mentioned_members: apenas mencionados e destinatário selecionado', () => {
    const result = computeGroupRecipients({
      policy: 'mentioned_members',
      memberIds: members,
      senderId: 'ana',
      target: { type: 'member', memberId: 'caio' },
      mentionedUserIds: ['bia', 'bia'],
    });
    assert.deepEqual(result.sort(), ['bia', 'caio']);
  });

  it('mentioned_members: ignora o remetente e quem não é integrante', () => {
    const result = computeGroupRecipients({
      policy: 'mentioned_members',
      memberIds: members,
      senderId: 'ana',
      target: { type: 'conversation' },
      mentionedUserIds: ['ana', 'removido'],
    });
    assert.deepEqual(result, []);
  });

  it('direct_messages_only e disabled: ninguém recebe', () => {
    for (const policy of ['direct_messages_only', 'disabled'] as const) {
      const result = computeGroupRecipients({
        policy,
        memberIds: members,
        senderId: 'ana',
        target: { type: 'member', memberId: 'bia' },
        mentionedUserIds: ['bia'],
      });
      assert.deepEqual(result, []);
    }
  });
});

describe('ids de conversa individual', () => {
  it('é o mesmo para o par em qualquer ordem', () => {
    assert.equal(buildDirectConversationId('b', 'a'), buildDirectConversationId('a', 'b'));
  });

  it('recusa ids fora de ordem ou com o mesmo usuário', () => {
    assert.deepEqual(parseDirectParticipants('direct_a_b'), ['a', 'b']);
    assert.equal(parseDirectParticipants('direct_b_a'), null);
    assert.equal(parseDirectParticipants('direct_a_a'), null);
    assert.equal(parseDirectParticipants('grupo123'), null);
  });
});
