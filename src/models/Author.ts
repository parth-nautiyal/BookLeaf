import mongoose from 'mongoose';

const authorSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, unique: true },
    name: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    city: String,
    joinedDate: String
  },
  { timestamps: true }
);

const Author = mongoose.model('Author', authorSchema);

export default Author;
