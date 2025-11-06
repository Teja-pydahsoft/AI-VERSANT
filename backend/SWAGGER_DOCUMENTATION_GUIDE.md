# 📚 Swagger API Documentation Guide

## Overview

This guide explains how to document API endpoints using Swagger/OpenAPI in the VERSANT application. All endpoints should be documented using Flasgger's docstring format.

## Accessing the Documentation

Once the server is running, access the Swagger UI at:
- **Swagger UI**: `http://localhost:8000/api-docs`
- **OpenAPI JSON**: `http://localhost:8000/apispec.json`

## Basic Documentation Format

### Template Structure

```python
@blueprint.route('/endpoint', methods=['POST'])
@jwt_required()  # If authentication required
def endpoint_function():
    """
    Endpoint Title
    ---
    tags:
      - Tag Name
    summary: Brief summary of what the endpoint does
    description: |
      Detailed description of the endpoint.
      Can span multiple lines.
      
      **Markdown formatting** is supported.
    security:
      - BearerAuth: []  # If JWT required
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - field1
              - field2
            properties:
              field1:
                type: string
                example: "example value"
                description: Field description
              field2:
                type: integer
                example: 123
    responses:
      200:
        description: Success response
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                data:
                  type: object
      400:
        description: Bad request
      401:
        description: Unauthorized
      500:
        description: Server error
    """
    # Your code here
```

## Common Patterns

### 1. GET Endpoint with Query Parameters

```python
@blueprint.route('/items', methods=['GET'])
@jwt_required()
def get_items():
    """
    Get Items
    ---
    tags:
      - Items
    summary: Retrieve a list of items
    parameters:
      - name: page
        in: query
        schema:
          type: integer
          default: 1
        description: Page number
      - name: per_page
        in: query
        schema:
          type: integer
          default: 10
        description: Items per page
      - name: filter
        in: query
        schema:
          type: string
        description: Filter criteria
    security:
      - BearerAuth: []
    responses:
      200:
        description: List of items
    """
```

### 2. POST Endpoint with Request Body

```python
@blueprint.route('/create', methods=['POST'])
@jwt_required()
def create_item():
    """
    Create Item
    ---
    tags:
      - Items
    summary: Create a new item
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - name
              - type
            properties:
              name:
                type: string
                example: "Item Name"
              type:
                type: string
                enum: [type1, type2]
              description:
                type: string
                nullable: true
    security:
      - BearerAuth: []
    responses:
      201:
        description: Item created successfully
      400:
        description: Invalid input
    """
```

### 3. Endpoint with Path Parameters

```python
@blueprint.route('/items/<item_id>', methods=['GET'])
@jwt_required()
def get_item(item_id):
    """
    Get Item by ID
    ---
    tags:
      - Items
    summary: Retrieve a specific item
    parameters:
      - name: item_id
        in: path
        required: true
        schema:
          type: string
        description: Item ID
    security:
      - BearerAuth: []
    responses:
      200:
        description: Item details
      404:
        description: Item not found
    """
```

### 4. File Upload Endpoint

```python
@blueprint.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    """
    Upload File
    ---
    tags:
      - Files
    summary: Upload a file
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
        description: File to upload
      - name: description
        in: formData
        type: string
        description: File description
    security:
      - BearerAuth: []
    responses:
      200:
        description: File uploaded successfully
    """
```

## Response Schemas

### Standard Success Response

```yaml
200:
  description: Success
  content:
    application/json:
      schema:
        type: object
        properties:
          success:
            type: boolean
            example: true
          message:
            type: string
            example: "Operation successful"
          data:
            type: object
            # Your data structure here
```

### Error Response

```yaml
400:
  description: Bad Request
  content:
    application/json:
      schema:
        type: object
        properties:
          success:
            type: boolean
            example: false
          message:
            type: string
            example: "Invalid request data"
          errors:
            type: array
            items:
              type: string
```

## Data Types

### Common Types

- `string` - Text
- `integer` - Whole numbers
- `number` - Decimal numbers
- `boolean` - True/false
- `array` - List of items
- `object` - Key-value pairs
- `null` - Null value

### Array Schema

```yaml
items:
  type: array
  items:
    type: object
    properties:
      id:
        type: string
      name:
        type: string
```

### Nested Object

```yaml
user:
  type: object
  properties:
    id:
      type: string
    profile:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
```

## Tags

Use consistent tags to group related endpoints:

- **Authentication** - Login, logout, token refresh
- **Student** - Student-facing endpoints
- **Super Admin** - Super admin management
- **Test Management** - Test creation and management
- **Technical Tests** - Compiler/technical test endpoints
- **Analytics** - Analytics and reporting

## Examples for Common Endpoints

### Authentication Endpoints

```python
# Login
tags: [Authentication]
# Logout
tags: [Authentication]
# Refresh Token
tags: [Authentication]
```

### Student Endpoints

```python
# Get Tests
tags: [Student]
# Submit Test
tags: [Student]
# Get Progress
tags: [Student]
```

### Test Management

```python
# Create Test
tags: [Test Management]
# Update Test
tags: [Test Management]
# Delete Test
tags: [Test Management]
```

## Tips

1. **Always include**: Summary, description, request body (if POST/PUT), responses
2. **Use examples**: Provide realistic example values
3. **Document errors**: Include all possible error responses (400, 401, 403, 404, 500)
4. **Security**: Add `security: - BearerAuth: []` for protected endpoints
5. **Be descriptive**: Clear descriptions help API consumers
6. **Use tags**: Group related endpoints together
7. **Markdown**: Use markdown formatting in descriptions for better readability

## Checklist for Documenting Endpoints

- [ ] Added Swagger docstring with proper format
- [ ] Included summary and description
- [ ] Documented all request parameters (query, path, body)
- [ ] Documented all response codes (200, 400, 401, 403, 404, 500)
- [ ] Added examples for request/response
- [ ] Added security tag if JWT required
- [ ] Used appropriate tag for grouping
- [ ] Tested in Swagger UI

## Priority Endpoints to Document

### High Priority (Do First)
1. ✅ `/auth/login` - User authentication
2. ✅ `/auth/logout` - User logout
3. ✅ `/auth/refresh` - Token refresh
4. `/student/tests` - Get available tests
5. `/student/tests/<test_id>/submit` - Submit test
6. `/test-management/technical/compile` - Compile code
7. `/superadmin/users` - User management
8. `/superadmin/tests` - Test management

### Medium Priority
- All student endpoints
- All test management endpoints
- Analytics endpoints
- Notification endpoints

### Low Priority
- Internal/admin endpoints
- Utility endpoints
- Development endpoints

## Testing Your Documentation

1. Start the server: `python main.py`
2. Open browser: `http://localhost:8000/api-docs`
3. Test the endpoint in Swagger UI
4. Verify request/response formats match documentation
5. Check that examples are correct

## Common Issues

### Issue: Documentation not showing
- **Solution**: Make sure docstring starts with `---` on a new line after the first line

### Issue: Request body not showing
- **Solution**: Check that `requestBody` is properly formatted with correct indentation

### Issue: Security not working
- **Solution**: Add `security: - BearerAuth: []` and test with valid JWT token

### Issue: Examples not displaying
- **Solution**: Ensure `example` is at the same level as `type` in property definition

## Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Flasgger Documentation](https://github.com/flasgger/flasgger)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)

---

**Note**: As you document more endpoints, update this guide with any patterns or issues you discover!

