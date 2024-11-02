const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  rollNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    middleName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    }
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  contactInfo: {
    email: {
      type: String,
      required: true,
      unique: true
    },
    phone: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /\d{3}-\d{3}-\d{4}/.test(v);
        },
        message: props => `${props.value} is not a valid phone number! Use format: xxx-xxx-xxxx`
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: {
        type: String,
        default: 'India'
      }
    }
  },
  academic: {
    branch: {
      type: String,
      required: true
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    batch: {
      type: String,
      required: true
    },
    section: String,
    cgpa: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },
    backlogCount: {
      type: Number,
      default: 0
    }
  },
  courses: [{
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    enrollmentDate: {
      type: Date,
      default: Date.now
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F', 'I', 'W'],
      default: 'I'
    },
    attendance: {
      present: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        default: 0
      }
    }
  }],
  attendance: {
    overallPercentage: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  parentInfo: {
    father: {
      name: String,
      occupation: String,
      phone: String,
      email: String
    },
    mother: {
      name: String,
      occupation: String,
      phone: String,
      email: String
    },
    guardian: {
      name: String,
      relationship: String,
      phone: String,
      email: String
    }
  },
  documents: [{
    type: {
      type: String,
      enum: ['aadhar', 'pancard', 'passport', 'other']
    },
    number: String,
    isVerified: {
      type: Boolean,
      default: false
    }
  }],
  fees: [{
    semester: Number,
    amount: Number,
    paid: Boolean,
    transactionId: String,
    paidDate: Date,
    dueDate: Date
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  let fullName = `${this.name.firstName} ${this.name.lastName}`;
  if (this.name.middleName) {
    fullName = `${this.name.firstName} ${this.name.middleName} ${this.name.lastName}`;
  }
  return fullName;
});

// Virtual for attendance percentage
studentSchema.virtual('attendancePercentage').get(function() {
  if (this.attendance.total === 0) return 0; return (this.attendance.present / this.attendance.total) * 100;
});

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;