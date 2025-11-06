"""
Swagger/OpenAPI documentation helpers for consistent API documentation
"""

def get_standard_responses():
    """Get standard response schemas for Swagger"""
    return {
        200: {
            "description": "Success",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": True},
                            "message": {"type": "string"},
                            "data": {"type": "object"}
                        }
                    }
                }
            }
        },
        400: {
            "description": "Bad Request - Invalid input",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "message": {"type": "string", "example": "Invalid request data"}
                        }
                    }
                }
            }
        },
        401: {
            "description": "Unauthorized - Invalid or missing authentication",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "message": {"type": "string", "example": "Unauthorized"}
                        }
                    }
                }
            }
        },
        403: {
            "description": "Forbidden - Insufficient permissions",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "message": {"type": "string", "example": "Access denied"}
                        }
                    }
                }
            }
        },
        404: {
            "description": "Not Found - Resource does not exist",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "message": {"type": "string", "example": "Resource not found"}
                        }
                    }
                }
            }
        },
        500: {
            "description": "Internal Server Error",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "message": {"type": "string", "example": "Internal server error"}
                        }
                    }
                }
            }
        }
    }


def get_auth_schema():
    """Get authentication schema for Swagger"""
    return {
        "BearerAuth": []
    }


def get_standard_request_body(properties, required_fields=None):
    """Generate standard request body schema"""
    schema = {
        "type": "object",
        "properties": properties,
        "required": required_fields or []
    }
    
    return {
        "content": {
            "application/json": {
                "schema": schema
            }
        }
    }


def get_pagination_schema():
    """Get pagination query parameters"""
    return [
        {
            "name": "page",
            "in": "query",
            "schema": {"type": "integer", "default": 1},
            "description": "Page number"
        },
        {
            "name": "per_page",
            "in": "query",
            "schema": {"type": "integer", "default": 10},
            "description": "Items per page"
        }
    ]


def get_filter_params(filters):
    """Get filter query parameters"""
    params = []
    for filter_name, filter_info in filters.items():
        params.append({
            "name": filter_name,
            "in": "query",
            "schema": filter_info.get("schema", {"type": "string"}),
            "description": filter_info.get("description", ""),
            "required": filter_info.get("required", False)
        })
    return params

