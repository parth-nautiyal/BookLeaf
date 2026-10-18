import mongoose from 'mongoose';
import {
  ticketCategories,
  ticketMessageTypes,
  ticketPriorities,
  ticketStatuses,
} from '../constants/ticket';
import { userRoles } from '../constants/user';

const ticketMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: userRoles,
      required: true,
    },
    type: {
      type: String,
      enum: ticketMessageTypes,
      required: true,
    },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

const aiSuggestionsSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ticketCategories },
    priority: { type: String, enum: ticketPriorities },
    draftResponse: { type: String, trim: true },
  },
  { _id: false },
);

const ticketSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Author',
      required: true,
      index: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ticketCategories,
      default: null,
    },
    priority: {
      type: String,
      enum: ticketPriorities,
      default: null,
    },
    status: {
      type: String,
      enum: ticketStatuses,
      default: 'Open',
    },
    messages: { type: [ticketMessageSchema], default: [] },
    aiSuggestions: {
      type: aiSuggestionsSchema,
      default: undefined,
    },
  },
  { timestamps: true },
);

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
