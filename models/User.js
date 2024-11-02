const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false // Don't return password by default in queries
  },
  role: {
    type: String,
    enum: {
      values: ['student', 'faculty', 'admin'],
      message: '{VALUE} is not a valid role'
    },
    required: [true, 'Role is required']
  },
  profile: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'role',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  verificationToken: String,
  isVerified: {
    type: Boolean,
    default: false
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    // Only hash password if it's modified or new
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Methods
userSchema.methods = {
  // Compare password
  comparePassword: async function(candidatePassword) {
    try {
      return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
      throw new Error('Password comparison failed');
    }
  },

  // Generate JWT token
  generateAuthToken: function() {
    try {
      return jwt.sign(
        { 
          _id: this._id,
          role: this.role,
          username: this.username 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
    } catch (error) {
      throw new Error('Token generation failed');
    }
  },

  // Generate password reset token
  generatePasswordResetToken: function() {
    try {
      const resetToken = crypto.randomBytes(32).toString('hex');
      this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      return resetToken;
    } catch (error) {
      throw new Error('Reset token generation failed');
    }
  },

  // Increment login attempts
  incrementLoginAttempts: async function() {
    try {
      // If lock has expired, restart count
      if (this.lockUntil && this.lockUntil < Date.now()) {
        return await this.updateOne({
          $set: { loginAttempts: 1 },
          $unset: { lockUntil: 1 }
        });
      }
      // Otherwise increment
      const updates = { $inc: { loginAttempts: 1 } };
      // Lock the account if we've reached max attempts and haven't locked it yet
      if (this.loginAttempts + 1 >= 5 && !this.lockUntil) {
        updates.$set = { lockUntil: Date.now() + 3600000 }; // 1 hour lock
      }
      return await this.updateOne(updates);
    } catch (error) {
      throw new Error('Failed to update login attempts');
    }
  }
};

// Statics
userSchema.statics = {
  // Find user by credentials
  findByCredentials: async function(username, password) {
    try {
      const user = await this.findOne({ username }).select('+password');
      if (!user) {
        throw new Error('Invalid login credentials');
      }

      if (user.lockUntil && user.lockUntil > Date.now()) {
        throw new Error('Account is temporarily locked');
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        await user.incrementLoginAttempts();
        throw new Error('Invalid login credentials');
      }

      // Reset login attempts on successful login
      await user.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
      });

      return user;
    } catch (error) {
      throw error;
    }
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;