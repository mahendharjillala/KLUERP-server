const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  courseName: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  credits: {
    type: Number,
    required: true,
    min: 1,
    max: 6,
  },
  faculty: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty'
  }],
  description: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 1000,
  },
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
  },
  enrolledStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    enrollmentDate: {
      type: Date,
      default: Date.now
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F', 'I', 'W'],
      default: 'I' // I for Incomplete
    }
  }],
  schedule: {
    days: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true
    }],
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: props => `${props.value} is not a valid time format! Use HH:MM`
      }
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: props => `${props.value} is not a valid time format! Use HH:MM`
      }
    },
    room: {
      type: String,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  syllabus: {
    topics: [{
      title: String,
      description: String,
      duration: Number // in hours
    }],
    textbooks: [{
      title: String,
      author: String,
      isbn: String,
      required: Boolean
    }]
  },
  assessments: [{
    type: {
      type: String,
      enum: ['quiz', 'assignment', 'midterm', 'final', 'project'],
      required: true
    },
    weightage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    deadline: Date
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
courseSchema.index({ courseCode: 1 });
courseSchema.index({ department: 1, semester: 1 });
courseSchema.index({ 'enrolledStudents.student': 1 });

// Virtual for current enrollment count
courseSchema.virtual('currentEnrollment').get(function() {
  return this.enrolledStudents.length;
});

// Virtual for available seats
courseSchema.virtual('availableSeats').get(function() {
  return this.capacity - this.enrolledStudents.length;
});

// Method to check if course is full
courseSchema.methods.isFull = function() {
  return this.enrolledStudents.length >= this.capacity;
};

// Method to enroll a student
courseSchema.methods.enrollStudent = async function(studentId) {
  if (this.isFull()) {
    throw new Error('Course is already at full capacity');
  }
  
  if (this.enrolledStudents.some(enrollment => enrollment.student.equals(studentId))) {
    throw new Error('Student is already enrolled in this course');
  }

  this.enrolledStudents.push({ student: studentId });
  return this.save();
};

// Method to update student grade
courseSchema.methods.updateGrade = async function(studentId, grade) {
  const enrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.equals(studentId)
  );
  
  if (!enrollment) {
    throw new Error('Student is not enrolled in this course');
  }

  enrollment.grade = grade;
  return this.save();
};

// Static method to find courses by department
courseSchema.statics.findByDepartment = function(department) {
  return this.find({ department: department });
};

// Middleware to prevent deletion if students are enrolled
courseSchema.pre('remove', async function(next) {
  if (this.enrolledStudents.length > 0) {
    next(new Error('Cannot delete course with enrolled students'));
  }
  next();
});

// Create the model
const Course = mongoose.model('Course', courseSchema);

module.exports = Course;