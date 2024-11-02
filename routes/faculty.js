const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');

// @route   POST /api/faculty
// @desc    Create a new faculty member
// @access  Private (Admin only)
router.post('/', [
  auth,
  [
    check('employeeId', 'Employee ID is required').notEmpty(),
    check('firstName', 'First name is required').notEmpty(),
    check('lastName', 'Last name is required').notEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('department', 'Department is required').notEmpty(),
    check('position', 'Position is required').notEmpty(),
    check('dateOfJoining', 'Date of joining is required').notEmpty().isISO8601().toDate()
  ]
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to create faculty members' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId, email } = req.body;

    // Check if faculty already exists
    let faculty = await Faculty.findOne({ $or: [{ employeeId }, { email }] });
    if (faculty) {
      return res.status(400).json({ msg: 'Faculty member already exists' });
    }

    faculty = new Faculty(req.body);
    await faculty.save();

    res.status(201).json(faculty);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/faculty
// @desc    Get all faculty members
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const faculty = await Faculty.find().select('-password').sort({ lastName: 1 });
    res.json(faculty);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/faculty/:id
// @desc    Get faculty member by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id).select('-password');
    if (!faculty) {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }
    res.json(faculty);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/faculty/:id
// @desc    Update faculty member
// @access  Private (Admin or Self)
router.put('/:id', [auth], async (req, res) => {
  try {
    let faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }

    // Check if user has permission to update
    if (req.user.role !== 'admin' && req.user.id !== faculty.id) {
      return res.status(403).json({ msg: 'Not authorized to update this faculty member' });
    }

    // Update fields
    const fieldsToUpdate = Object.keys(req.body);
    fieldsToUpdate.forEach(field => faculty[field] = req.body[field]);

    await faculty.save();
    res.json(faculty);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/faculty/:id
// @desc    Delete faculty member
// @access  Private (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to delete faculty members' });
    }

    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }

    // Remove faculty from associated courses
    await Course.updateMany(
      { faculty: faculty._id },
      { $pull: { faculty: faculty._id } }
    );

    await faculty.remove();
    res.json({ msg: 'Faculty member removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/faculty/:id/courses
// @desc    Get courses taught by faculty member
// @access  Private
router.get('/:id/courses', auth, async (req, res) => {
  try {
    const courses = await Course.find({ faculty: req.params.id })
      .populate('faculty', 'firstName lastName')
      .sort({ courseCode: 1 });

    res.json(courses);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/faculty/:id/courses/:courseId
// @desc    Assign course to faculty member
// @access  Private (Admin only)
router.post('/:id/courses/:courseId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to assign courses' });
    }

    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    if (course.faculty.includes(faculty._id)) {
      return res.status(400).json({ msg: 'Faculty already assigned to this course' });
    }

    course.faculty.push(faculty._id);
    await course.save();

    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/faculty/:id/courses/:courseId
// @desc    Remove course from faculty member
// @access  Private (Admin only)
router.delete('/:id/courses/:courseId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to remove course assignments' });
    }

    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ msg: 'Faculty member not found' });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ msg: 'Course not found' });
    }

    const index = course.faculty.indexOf(faculty._id);
    if (index === -1) {
      return res.status(400).json({ msg: 'Faculty not assigned to this course' });
    }

    course.faculty.splice(index, 1);
    await course.save();

    res.json(course);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;