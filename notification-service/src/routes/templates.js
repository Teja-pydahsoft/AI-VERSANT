const express = require('express');
const { body, validationResult } = require('express-validator');
const { Template } = require('../models/Template');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Get all templates
router.get('/', async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;
    
    const filter = type ? { type } : {};
    const templates = await Template.find(filter)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    const total = await Template.countDocuments(filter);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + templates.length < total
        }
      }
    });

  } catch (error) {
    logger.error('Error getting templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get templates',
      error: error.message
    });
  }
});

// Get template by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });

  } catch (error) {
    logger.error('Error getting template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get template',
      error: error.message
    });
  }
});

// Create new template
router.post('/', [
  body('name').notEmpty().withMessage('Template name is required'),
  body('type').isIn(['email', 'sms', 'push']).withMessage('Type must be email, sms, or push'),
  body('subject').optional().isString(),
  body('content').notEmpty().withMessage('Template content is required'),
  body('variables').optional().isArray()
], validateRequest, async (req, res) => {
  try {
    const { name, type, subject, content, variables = [] } = req.body;

    const template = new Template({
      name,
      type,
      subject,
      content,
      variables,
      isActive: true
    });

    await template.save();

    logger.info(`📝 Template created: ${name} (${type})`);

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: template
    });

  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  }
});

// Update template
router.put('/:id', [
  body('name').optional().notEmpty(),
  body('type').optional().isIn(['email', 'sms', 'push']),
  body('subject').optional().isString(),
  body('content').optional().notEmpty(),
  body('variables').optional().isArray(),
  body('isActive').optional().isBoolean()
], validateRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const template = await Template.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    logger.info(`📝 Template updated: ${template.name}`);

    res.json({
      success: true,
      message: 'Template updated successfully',
      data: template
    });

  } catch (error) {
    logger.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findByIdAndDelete(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    logger.info(`📝 Template deleted: ${template.name}`);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  }
});

// Render template with variables
router.post('/:id/render', [
  body('variables').isObject().withMessage('Variables must be an object')
], validateRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Simple template rendering (replace {{variable}} with values)
    let renderedContent = template.content;
    let renderedSubject = template.subject || '';

    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      renderedContent = renderedContent.replace(regex, variables[key]);
      renderedSubject = renderedSubject.replace(regex, variables[key]);
    });

    res.json({
      success: true,
      data: {
        subject: renderedSubject,
        content: renderedContent,
        variables
      }
    });

  } catch (error) {
    logger.error('Error rendering template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to render template',
      error: error.message
    });
  }
});

module.exports = router;
