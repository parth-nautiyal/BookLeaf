export const ticketStatuses = [
  'Open',
  'In Progress',
  'Resolved',
  'Closed',
] as const;

export const ticketCategories = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
] as const;

export const ticketPriorities = ['Critical', 'High', 'Medium', 'Low'] as const;
export const ticketMessageTypes = ['public_reply', 'internal_note'] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketCategory = (typeof ticketCategories)[number];
export type TicketPriority = (typeof ticketPriorities)[number];
export type TicketMessageType = (typeof ticketMessageTypes)[number];
