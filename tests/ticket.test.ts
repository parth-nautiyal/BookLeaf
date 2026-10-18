import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import test from 'node:test';
import {
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
} from '../src/constants/ticket';
import Ticket from '../src/models/Ticket';

const validTicket = () => ({
  author: new mongoose.Types.ObjectId(),
  book: new mongoose.Types.ObjectId(),
  subject: 'Question about royalties',
  description: 'Please clarify the latest royalty statement.',
  category: 'Royalty & Payments',
  priority: 'Medium',
  status: 'Open',
});

test('valid ticket satisfies model constraints without a database', () => {
  const ticket = new Ticket(validTicket());

  assert.equal(ticket.validateSync(), undefined);
  assert.equal(ticket.author instanceof mongoose.Types.ObjectId, true);
  assert.equal(ticket.book instanceof mongoose.Types.ObjectId, true);
  assert.equal(ticket.schema.options.timestamps, true);
});

test('ticket permits general queries and AI failures without classification values', () => {
  const ticket = new Ticket({
    ...validTicket(),
    book: null,
    category: null,
    priority: null,
    status: undefined,
  });

  assert.equal(ticket.validateSync(), undefined);
  assert.equal(ticket.book, null);
  assert.equal(ticket.category, null);
  assert.equal(ticket.priority, null);
  assert.equal(ticket.status, 'Open');
  assert.equal(ticket.assignedTo, null);
});

test('missing essential ticket fields are rejected', () => {
  const ticket = new Ticket({});
  const error = ticket.validateSync();

  assert.ok(error);
  for (const field of ['author', 'subject', 'description']) {
    assert.ok(error.errors[field], `${field} should be required`);
  }
});

test('PDF category, priority, and status values are the supported enums', () => {
  assert.deepEqual(ticketCategories, [
    'Royalty & Payments',
    'ISBN & Metadata Issues',
    'Printing & Quality',
    'Distribution & Availability',
    'Book Status & Production Updates',
    'General Inquiry',
  ]);
  assert.deepEqual(ticketPriorities, ['Critical', 'High', 'Medium', 'Low']);
  assert.deepEqual(ticketStatuses, [
    'Open',
    'In Progress',
    'Resolved',
    'Closed',
  ]);
});

test('invalid ticket category, status, and priority are rejected', () => {
  const ticket = new Ticket({
    ...validTicket(),
    status: 'Waiting for Author',
    category: 'royalty_question',
    priority: 'urgent',
  });
  const error = ticket.validateSync();

  assert.ok(error);
  assert.ok(error.errors.status);
  assert.ok(error.errors.category);
  assert.ok(error.errors.priority);
});

test('assignedTo references a User and accepts an unassigned ticket', () => {
  const assignedUserId = new mongoose.Types.ObjectId();
  const assignedTicket = new Ticket({
    ...validTicket(),
    assignedTo: assignedUserId,
  });
  const unassignedTicket = new Ticket(validTicket());

  assert.equal(assignedTicket.validateSync(), undefined);
  assert.equal(
    assignedTicket.assignedTo?.toString(),
    assignedUserId.toString(),
  );
  assert.equal(unassignedTicket.assignedTo, null);
});

test('public replies and internal notes are distinct and attributed', () => {
  const ticket = new Ticket({
    ...validTicket(),
    messages: [
      {
        sender: new mongoose.Types.ObjectId(),
        senderRole: 'admin',
        type: 'public_reply',
        content: 'We are checking this for you.',
      },
      {
        sender: new mongoose.Types.ObjectId(),
        senderRole: 'admin',
        type: 'internal_note',
        content: 'Check the statement import before replying.',
      },
    ],
  });

  assert.equal(ticket.validateSync(), undefined);
  assert.equal(ticket.messages[0].type, 'public_reply');
  assert.equal(ticket.messages[1].type, 'internal_note');
  assert.equal(ticket.messages[0].senderRole, 'admin');
  assert.equal(ticket.messages[0].schema.options.timestamps, true);
});

test('invalid message type or sender role is rejected', () => {
  const ticket = new Ticket({
    ...validTicket(),
    messages: [
      {
        sender: new mongoose.Types.ObjectId(),
        senderRole: 'moderator',
        type: 'private',
        content: 'This should fail validation.',
      },
    ],
  });
  const error = ticket.validateSync();

  assert.ok(error);
  assert.ok(error.errors['messages.0.senderRole']);
  assert.ok(error.errors['messages.0.type']);
});

test('AI suggestions remain separate from confirmed ticket values', () => {
  const ticket = new Ticket({
    ...validTicket(),
    category: 'General Inquiry',
    priority: 'Low',
    aiSuggestions: {
      category: 'Royalty & Payments',
      priority: 'High',
      draftResponse: 'Please share the statement period.',
    },
  });

  assert.equal(ticket.validateSync(), undefined);
  assert.equal(ticket.category, 'General Inquiry');
  assert.equal(ticket.priority, 'Low');
  assert.equal(ticket.aiSuggestions?.category, 'Royalty & Payments');
  assert.equal(ticket.aiSuggestions?.priority, 'High');
});
