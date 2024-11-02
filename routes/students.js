const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const Course = require('../models/Course');

// @route   POST /api/students
// @desc    Create a new student
// @access  Private (Admin only)
router.post('/', [
  auth,
  [
    check('rollNumber', 'Roll number is required').notEmpty(),
    check('name.firstName', 'First name is required').notEmpty(),
    check('name.lastName', 'Last name is required').notEmpty(),
    check('dateOfBirth', 'Date of birth is required').notEmpty().isISO8601().toDate(),
    check('gender', 'Gender is required').isIn(['Male', 'Female', 'Other']),
    check('contactInfo.email', 'Please include a valid email').isEmail(),
    check('contactInfo.phone', 'Please enter a valid phone number').matches(/\d{3}-\d{3}-\d{4}/),
    check('academic.branch', 'Branch is required').notEmpty(),
    check('academic.semester', 'Semester must be between 1 and 8').isInt({ min: 1, max: 8 }),
    check('academic.batch', 'Batch is required').notEmpty()
  ]
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to create students' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { rollNumber, contactInfo: { email } } = req.body;

    // Check if student already exists
    let student = await Student.findOne({ 
      $or: [{ rollNumber }, { 'contactInfo.email': email }] 
    });
    
    if (student) {
      return res.status(400).json({ msg: 'Student already exists' });
    }

    student = new Student({
      ...req.body,
      user: req.user.id
    });

    await student.save();
    res.status(201).json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/students
// @desc    Get all students with optional filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      branch,
      semester,
      batch,
      search,
      sortBy,
      order,
      page = 1,
      limit = 10
    } = req.query;

    let query = {};

    // Add filters if they exist
    if (branch) query['academic.branch'] = branch;
    if (semester) query['academic.semester'] = semester;
    if (batch) query['academic.batch'] = batch;
    if (search) {
      query.$or = [
        { rollNumber: { $regex: search, $options: 'i' } },
        { 'name.firstName': { $regex: search, $options: 'i' } },
        { 'name.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObject = {};
    if (sortBy) {
      sortObject[sortBy] = order === 'desc' ? -1 : 1;
    } else {
      sortObject['rollNumber'] = 1; // Default sort
    }

    const students = await Student.find(query)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('courses.course', 'courseCode courseName');

    const total = await Student.countDocuments(query);

    res.json({
      students,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/students/:id
// @desc    Get student by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('courses.course', 'courseCode courseName credits')
      .populate('user', 'username email');

    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Check if user has permission to view student details
    if (req.user.role !== 'admin' && 
        req.user.role !== 'faculty' && 
        req.user.id !== student.user.toString()) {
      return res.status(403).json({ msg: 'Not authorized to view this student' });
    }

    res.json(student);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Student not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private (Admin or Self)
router.put('/:id', [auth], async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Check if user has permission to update
    if (req.user.role !== 'admin' && req.user.id !== student.user.toString()) {
      return res.status(403).json({ msg: 'Not authorized to update this student' });
    }

    // Update fields
    const updates = req.body;
    Object.keys(updates).forEach(update => {
      if (update !== 'user' && update !== '_id') { // Prevent updating protected fields
        if (typeof updates[update] === 'object') {
          student[update] = { ...student[update], ...updates[update] };
        } else {
          student[update] = updates[update];
        }
      }
    });

    await student.save();
    res.json(student);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Student not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student
// @access  Private (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to delete students' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Remove student from all enrolled courses
    await Course.updateMany(
      { 'enrolledStudents.student': student._id },
      { $pull: { enrolledStudents: { student: student._id } } }
    );

    await student.remove();
    res.json({ msg: 'Student removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Student not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route    GET /api/students/:id/courses
// @desc     Get courses enrolled by student
// @access   Private
router.get('/:id/courses', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Check if user has permission to view student courses
    if (req.user.role !== 'admin' && 
        req.user.role !== 'faculty' && 
        req.user.id !== student.user.toString()) {
      return res.status(403).json({ msg: 'Not authorized to view this student\'s courses' });
    }

    const courses = await Course.find({ 'enrolledStudents.student': student._id })
      .populate('faculty', 'firstName lastName')
      .sort({ courseCode: 1 });

    res.json(courses);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/students/:id/courses/:courseId
// @desc    Enroll student in course
// @access  Private (Admin or Faculty)
router.post('/:id/courses/:courseId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
      return res.status(403).json({ msg: 'Not authorized to enroll students in courses' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    // Check if student is already enrolled in course
    if (course.enrolledStudents.some(enrolledStudent => enrolledStudent.student.toString() === student._id.toString())) {
      return res.status(400).json({ msg: 'Student already enrolled in this course' });
    }

    course.enrolledStudents.push({ student: student._id });
    await course.save();

    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/students/:id/courses/:courseId
// @desc    Remove student from course
// @access  Private (Admin or Faculty)
router.delete('/:id/courses/:courseId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
      return res.status(403).json({ msg: 'Not authorized to remove students from courses' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    // Check if student is enrolled in course
    const index = course.enrolledStudents.findIndex(enrolledStudent => enrolledStudent.student.toString() === student._id.toString());
    if (index === -1) {
      return res.status(400).json({ msg: 'Student not enrolled in this course' });
    }

    course.enrolledStudents.splice(index, 1);
    await course.save();

    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;