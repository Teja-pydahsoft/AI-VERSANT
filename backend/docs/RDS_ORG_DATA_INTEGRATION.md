# AWS RDS Organization Data (Read-Only)

AI-VERSANT can load **colleges (campuses)**, **courses**, **batches**, and **student lists** from the master `student_database` on AWS RDS MySQL instead of MongoDB.

## Environment variables

Add to `backend/.env`:

```env
DB_HOST=student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=your_password
DB_NAME=student_database
DB_SSL=true
USE_RDS_ORG_DATA=true
MYSQL_RDS_READ_ONLY=true
```

| Variable | Description |
|----------|-------------|
| `USE_RDS_ORG_DATA` | `true` = list endpoints read from RDS |
| `MYSQL_RDS_READ_ONLY` | `true` = block INSERT/UPDATE/DELETE in app layer |
| `DB_*` | Standard MySQL connection settings |

## RDS schema mapping

| RDS table | AI-VERSANT concept | Notes |
|-----------|-------------------|--------|
| `colleges` | Campus / college | 8 active colleges |
| `courses` | Course | Linked via `college_id` |
| `course_branches` | Branch (optional) | e.g. CSE, ECE under B.Tech |
| `students` | Student list (view) | ~5,800 rows; `college`, `course`, `batch` are text fields |
| `students.batch` | Batch year | e.g. `2024`, `2025` — derived batch groups |

**Batches** are one per course + admission year (e.g. `2026 B.Tech`), with all branches (CSE, ECE, MEC) grouped inside.

**Batch IDs**: `rds_b_{college_id}_{course_id}_{batch_year}` (legacy) or `rds_b_{college_id}_{batch_year}` when course is unknown.

**Student IDs** from RDS: `rds_s_{students.id}`

## What stays in MongoDB

- User login / JWT (`users` with passwords)
- Tests, attempts, progress, notifications, analytics

Writes to campuses, courses, batches, or student upload return **403** with a read-only message when RDS mode is on.

## Explore script

```bash
cd backend
python scripts/explore_rds_schema.py
```

## Health check

`GET /health` includes `rds_mysql` status when configured.
