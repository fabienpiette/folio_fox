package repositories

import (
	"context"
	"database/sql"
	"time"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// SQLiteUserRepository implements UserRepository using SQLite
type SQLiteUserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new SQLite-based user repository
func NewUserRepository(db *sql.DB) UserRepository {
	return &SQLiteUserRepository{
		db: db,
	}
}

// Create creates a new user
func (r *SQLiteUserRepository) Create(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (username, email, password_hash, is_active, is_admin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`
	
	result, err := r.db.ExecContext(ctx, query,
		user.Username, user.Email, user.PasswordHash, user.IsActive, user.IsAdmin)
	if err != nil {
		return err
	}
	
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	
	user.ID = id
	return nil
}

// GetByID retrieves a user by ID
func (r *SQLiteUserRepository) GetByID(ctx context.Context, id int64) (*models.User, error) {
	query := `
		SELECT id, username, email, password_hash, is_active, is_admin, last_login, created_at, updated_at
		FROM users WHERE id = ?
	`
	
	user := &models.User{}
	var lastLogin sql.NullTime
	
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.IsActive, &user.IsAdmin, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	
	return user, nil
}

// GetByUsername retrieves a user by username
func (r *SQLiteUserRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	query := `
		SELECT id, username, email, password_hash, is_active, is_admin, last_login, created_at, updated_at
		FROM users WHERE username = ?
	`
	
	user := &models.User{}
	var lastLogin sql.NullTime
	
	err := r.db.QueryRowContext(ctx, query, username).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.IsActive, &user.IsAdmin, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	
	return user, nil
}

// GetByEmail retrieves a user by email
func (r *SQLiteUserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT id, username, email, password_hash, is_active, is_admin, last_login, created_at, updated_at
		FROM users WHERE email = ?
	`
	
	user := &models.User{}
	var lastLogin sql.NullTime
	
	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.IsActive, &user.IsAdmin, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	
	return user, nil
}

// Update updates an existing user
func (r *SQLiteUserRepository) Update(ctx context.Context, user *models.User) error {
	query := `
		UPDATE users 
		SET username = ?, email = ?, password_hash = ?, is_active = ?, is_admin = ?, updated_at = datetime('now')
		WHERE id = ?
	`
	
	_, err := r.db.ExecContext(ctx, query,
		user.Username, user.Email, user.PasswordHash, user.IsActive, user.IsAdmin, user.ID)
	return err
}

// Delete deletes a user by ID
func (r *SQLiteUserRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM users WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// List retrieves a list of users with pagination
func (r *SQLiteUserRepository) List(ctx context.Context, limit, offset int) ([]*models.User, error) {
	query := `
		SELECT id, username, email, password_hash, is_active, is_admin, last_login, created_at, updated_at
		FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
	`
	
	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		var lastLogin sql.NullTime
		
		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.PasswordHash,
			&user.IsActive, &user.IsAdmin, &lastLogin, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		
		if lastLogin.Valid {
			user.LastLogin = &lastLogin.Time
		}
		
		users = append(users, user)
	}
	
	return users, rows.Err()
}

// UpdateLastLogin updates the last login time for a user
func (r *SQLiteUserRepository) UpdateLastLogin(ctx context.Context, id int64, loginTime time.Time) error {
	query := `UPDATE users SET last_login = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, loginTime, id)
	return err
}