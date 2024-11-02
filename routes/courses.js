const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Course = require('../models/Course');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');

// @route   POST /api/courses
// @desc    Create a new course
// @access  Private (Admin/Faculty)
router.post('/', [
  auth,
  [
    check('courseCode', 'Course code is required').notEmpty(),
    check('courseName', 'Course name is required').notEmpty(),
    check('department', 'Department is required').notEmpty(),
    check('credits', 'Credits must be between 1 and 6').isInt({ min: 1, max: 6 }),
    check('semester', 'Semester must be between 1 and 8').isInt({ min: 1, max: 8 }),
    check('capacity', 'Capacity must be a positive number').isInt({ min: 1 })
  ]
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user has permission to create course
    if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
      return res.status(403).json({ msg: 'Not authorized to create courses' });
    }

    const newCourse = new Course({
      ...req.body,
      faculty: req.body.faculty || []
    });

    const course = await newCourse.save();
    res.status(201).json(course);
  } catch (err) {
    console.error(err.message);
    if (err.code === 11000) {
      return res.status(400).json({ msg: 'Course code already exists' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/courses
// @desc    Get all courses with optional filters
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      department,
      semester,
      faculty,
      status,
      search
    } = req.query;

    let query = {};

    // Add filters if they exist
    if (department) query.department = department;
    if (semester) query.semester = semester;
    if (faculty) query.faculty = faculty;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { courseCode: { $regex: search, $options: 'i' } },
        { courseName: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await Course.find(query)
      .populate('faculty', 'firstName lastName email')
      .populate('prerequisites', 'courseCode courseName')
      .sort({ courseCode: 1 });

    res.json(courses);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/courses/:id
// @desc    Get course by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('faculty', 'firstName lastName email')
      .populate('prerequisites', 'courseCode courseName')
      .populate('enrolledStudents.student', 'name rollNumber');

    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    res.json(course);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Course not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course
// @access  Private (Admin/Faculty)
router.put('/:id', [auth], async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    // Check if user has permission to update course
    if (req.user.role !== 'admin' && 
        !course.faculty.includes(req.user.id)) {
      return res.status(403).json({ msg: 'Not authorized to update this course' });
    }

    course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.json(course);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Course not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete course
// @access  Private (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to delete courses' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    if (course.enrolledStudents.length > 0) {
      return res.status(400).json({ msg: 'Cannot delete course with enrolled students' });
    }

    await course.remove();
    res.json({ msg: 'Course removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Course not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/courses/:id/enroll
// @desc    Enroll student in course
// @access  Private (Student)
router.post('/:id/enroll', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ msg: 'Only students can enroll in courses' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    // Check if course is full
    if (course.enrolledStudents.length >= course.capacity) {
      return res.status(400).json({ msg: 'Course is full' });
    }

    // Check if student is already enrolled
    if (course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user.id
    )) {
      return res.status(400).json({ msg: 'Already enrolled in this course' });
    }

    course.enrolledStudents.push({
      student: req.user.id,
      enrollmentDate: Date.now()
    });

    await course.save();
    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/courses/:id/grade/:studentId
// @desc    Update student's grade
// @access  Private (Faculty)
router.put('/:id/grade/:studentId', [
  auth,
  [
    check('grade', 'Grade is required').notEmpty()
      .isIn(['A+', ' A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'])
  ]
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    // Check if user has permission to update grades
    if (req.user.role !== 'faculty' && 
        !course.faculty.includes(req.user.id)) {
      return res.status(403).json({ msg: 'Not authorized to update grades' });
    }

    const studentId = req.params.studentId;
    const grade = req.body.grade;

    const enrollmentIndex = course.enrolledStudents.findIndex(
      enrollment => enrollment.student.toString() === studentId
    );

    if (enrollmentIndex === -1) {
      return res.status(404).json({ msg: 'Student not found in this course' });
    }

    course.enrolledStudents[enrollmentIndex].grade = grade;
    await course.save();
    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;