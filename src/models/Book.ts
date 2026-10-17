import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    bookId: { type: String, required: true, unique: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Author',
      required: true,
      index: true,
    },
    title: String,
    isbn: { type: String, required: true, unique: true },
    genre: String,
    status: String,
    publicationDate: { type: String, default: null },
    mrp: { type: Number, default: null, min: 0 },
    authorRoyaltyPerCopy: { type: Number, default: null, min: 0 },
    totalCopiesSold: { type: Number, min: 0 },
    totalRoyaltyEarned: { type: Number, min: 0 },
    royaltyPaid: { type: Number, min: 0 },
    royaltyPending: { type: Number, min: 0 },
    lastRoyaltyPayoutDate: { type: String, default: null },
    printPartner: { type: String, default: null },
    availableOn: { type: [String], default: [] },
  },
  { timestamps: true },
);

const Book = mongoose.model('Book', bookSchema);

export default Book;
