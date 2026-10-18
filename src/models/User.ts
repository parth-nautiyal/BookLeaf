import mongoose from 'mongoose';

export type UserRole = 'author' | 'admin';

interface UserData {
  email: string;
  passwordHash: string;
  role: UserRole;
  author?: mongoose.Types.ObjectId;
}

const userSchema = new mongoose.Schema<UserData>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ['author', 'admin'] },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Author',
      required: function (this: UserData) {
        return this.role === 'author';
      },
    },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);

export default User;
