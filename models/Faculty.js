const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  position: {
    type: String,
    required: true,
    enum: ['Assistant Professor', 'Associate Professor', 'Professor', 'Adjunct', 'Lecturer']
  },
  dateOfJoining: {
    type: Date,
    required: true
  },
  qualifications: [{
    degree: String,
    field: String,
    institution: String,
    year: Number
  }],
  specializations: [String],
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  researchInterests: [String],
  publications: [{
    title: String,
    journal: String,
    year: Number,
    doi: String
  }],
  officeHours: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    },
    startTime: String,
    endTime: String
  }],
  contactNumber: {
    type: String,
    validate: {
      validator: function(v) {
        return /\d{3}-\d{3}-\d{4}/.test(v);
      },
      message: props => `${props.value} is not a valid phone number! Use format: xxx-xxx-xxxx`
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date
}, {
  timestamps: true
});

// Virtual for full name
facultySchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to hash password
facultySchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
facultySchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to assign a course
facultySchema.methods.assignCourse = async function(courseId) {
  if (!this.courses.includes(courseId)) {
    this.courses.push(courseId);
    await this.save();
  }
};

// Method to remove a course
facultySchema.methods.removeCourse = async function(courseId) {
  this.courses = this.courses.filter(course => !course.equals(courseId));
  await this.save();
};

// Static method to find faculty by department
facultySchema.statics.findByDepartment = function(department) {
  return this.find({ department: department });
};

// Static method to find faculty teaching a specific course
facultySchema.statics.findByCourse = function(courseId) {
  return this.find({ courses: courseId });
};

// Indexes for better query performance
facultySchema.index({ employeeId: 1 });
facultySchema.index({ department: 1 });
facultySchema.index({ courses: 1 });

const Faculty = mongoose.model('Faculty', facultySchema);

module.exports = Faculty;