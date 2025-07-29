package downloads

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// FileManager handles file organization, duplicate detection, and library scanning
type FileManager struct {
	bookRepo     repositories.BookRepository
	bookFileRepo repositories.BookFileRepository
	userPrefRepo repositories.UserPreferencesRepository
	logger       *logrus.Logger
}

// NewFileManager creates a new file manager
func NewFileManager(
	bookRepo repositories.BookRepository,
	bookFileRepo repositories.BookFileRepository,
	userPrefRepo repositories.UserPreferencesRepository,
	logger *logrus.Logger,
) *FileManager {
	return &FileManager{
		bookRepo:     bookRepo,
		bookFileRepo: bookFileRepo,
		userPrefRepo: userPrefRepo,
		logger:       logger,
	}
}

// OrganizeDownload organizes a completed download according to user preferences
func (fm *FileManager) OrganizeDownload(ctx context.Context, download *models.DownloadQueueItem) error {
	if download.DownloadPath == nil {
		return fmt.Errorf("download path is nil")
	}

	fm.logger.Infof("Organizing download: %s", download.Title)

	// Get user's download folders
	folders, err := fm.userPrefRepo.GetDownloadFolders(ctx, download.UserID)
	if err != nil {
		return fmt.Errorf("failed to get download folders: %w", err)
	}

	var targetFolder *models.DownloadFolder
	for _, folder := range folders {
		if folder.IsDefault {
			targetFolder = folder
			break
		}
	}

	if targetFolder == nil || !targetFolder.AutoOrganize {
		fm.logger.Debug("Auto-organization disabled or no default folder")
		return nil
	}

	// Generate organized path
	organizedPath := fm.generateOrganizedPath(targetFolder, download)
	
	// Skip if already in the correct location
	if *download.DownloadPath == organizedPath {
		fm.logger.Debug("File already in organized location")
		return nil
	}

	// Create target directory
	targetDir := filepath.Dir(organizedPath)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create target directory: %w", err)
	}

	// Check for duplicates before moving
	if fm.isDuplicate(ctx, organizedPath, *download.DownloadPath) {
		fm.logger.Warnf("Duplicate file detected, not moving: %s", download.Title)
		return nil
	}

	// Move file to organized location
	if err := os.Rename(*download.DownloadPath, organizedPath); err != nil {
		return fmt.Errorf("failed to move file: %w", err)
	}

	fm.logger.Infof("File organized: %s -> %s", *download.DownloadPath, organizedPath)

	// Update download path in database
	download.DownloadPath = &organizedPath
	// Note: In a real implementation, you'd update this in the database

	// Add to library if associated with a book
	if download.BookID != nil {
		return fm.addFileToLibrary(ctx, *download.BookID, organizedPath, download.FileFormat)
	}

	return nil
}

// DetectDuplicates scans for duplicate files in the library
func (fm *FileManager) DetectDuplicates(ctx context.Context, userID int64) ([]*DuplicateGroup, error) {
	fm.logger.Info("Starting duplicate detection scan")

	// Get all user's download folders
	folders, err := fm.userPrefRepo.GetDownloadFolders(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get download folders: %w", err)
	}

	// Build file inventory
	inventory := make(map[string][]*FileInfo)
	
	for _, folder := range folders {
		if err := fm.scanFolderForDuplicates(folder.Path, inventory); err != nil {
			fm.logger.Errorf("Failed to scan folder %s: %v", folder.Path, err)
			continue
		}
	}

	// Find duplicates
	var duplicateGroups []*DuplicateGroup
	for checksum, files := range inventory {
		if len(files) > 1 {
			duplicateGroups = append(duplicateGroups, &DuplicateGroup{
				Checksum: checksum,
				Files:    files,
				Count:    len(files),
			})
		}
	}

	fm.logger.Infof("Found %d duplicate groups", len(duplicateGroups))
	return duplicateGroups, nil
}

// ScanLibrary scans library folders and indexes new files
func (fm *FileManager) ScanLibrary(ctx context.Context, userID int64) (*ScanResult, error) {
	fm.logger.Info("Starting library scan")
	startTime := time.Now()

	// Get user's download folders
	folders, err := fm.userPrefRepo.GetDownloadFolders(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get download folders: %w", err)
	}

	result := &ScanResult{
		StartTime:    startTime,
		ScannedFiles: 0,
		NewFiles:     0,
		UpdatedFiles: 0,
		Errors:       []string{},
	}

	for _, folder := range folders {
		folderResult, err := fm.scanFolder(ctx, folder.Path)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Folder %s: %v", folder.Path, err))
			continue
		}
		
		result.ScannedFiles += folderResult.ScannedFiles
		result.NewFiles += folderResult.NewFiles
		result.UpdatedFiles += folderResult.UpdatedFiles
		result.Errors = append(result.Errors, folderResult.Errors...)
	}

	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime)

	fm.logger.Infof("Library scan completed: %d files scanned, %d new, %d updated in %v",
		result.ScannedFiles, result.NewFiles, result.UpdatedFiles, result.Duration)

	return result, nil
}

// ConvertFormat converts a book file to a different format (placeholder for future implementation)
func (fm *FileManager) ConvertFormat(ctx context.Context, sourceFile string, targetFormat string) (string, error) {
	// This would integrate with tools like Calibre for format conversion
	// For now, return an error indicating it's not implemented
	return "", fmt.Errorf("format conversion not yet implemented")
}

// ValidateFile validates that a downloaded file is valid for its format
func (fm *FileManager) ValidateFile(filePath, format string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("cannot open file: %w", err)
	}
	defer file.Close()

	// Get file info
	info, err := file.Stat()
	if err != nil {
		return fmt.Errorf("cannot stat file: %w", err)
	}

	// Check if file is empty
	if info.Size() == 0 {
		return fmt.Errorf("file is empty")
	}

	// Basic format validation based on magic bytes
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return fmt.Errorf("cannot read file header: %w", err)
	}

	header := buffer[:n]
	
	switch strings.ToLower(format) {
	case "epub":
		// EPUB files are ZIP archives starting with PK
		if len(header) < 4 || string(header[:2]) != "PK" {
			return fmt.Errorf("invalid EPUB file: missing ZIP signature")
		}
	case "pdf":
		// PDF files start with %PDF
		if len(header) < 4 || string(header[:4]) != "%PDF" {
			return fmt.Errorf("invalid PDF file: missing PDF signature")
		}
	case "txt":
		// Text files should contain mostly printable characters
		nonPrintable := 0
		for _, b := range header {
			if b < 32 && b != 9 && b != 10 && b != 13 {
				nonPrintable++
			}
		}
		if float64(nonPrintable)/float64(len(header)) > 0.3 {
			return fmt.Errorf("invalid text file: too many non-printable characters")
		}
	}

	return nil
}

// generateOrganizedPath creates an organized file path based on the folder pattern
func (fm *FileManager) generateOrganizedPath(folder *models.DownloadFolder, download *models.DownloadQueueItem) string {
	pattern := folder.FolderPattern
	if pattern == "" {
		pattern = "{author}/{title}"
	}

	// Extract components
	author := "Unknown Author"
	if download.AuthorName != nil && *download.AuthorName != "" {
		author = fm.sanitizePathComponent(*download.AuthorName)
	}

	title := fm.sanitizePathComponent(download.Title)
	format := strings.ToUpper(download.FileFormat)
	
	// Replace placeholders
	path := strings.ReplaceAll(pattern, "{author}", author)
	path = strings.ReplaceAll(path, "{title}", title)
	path = strings.ReplaceAll(path, "{format}", format)
	path = strings.ReplaceAll(path, "{series}", "Unsorted") // Default since we don't have series info
	
	// Generate filename
	filename := fmt.Sprintf("%s.%s", title, download.FileFormat)
	
	return filepath.Join(folder.Path, path, filename)
}

// sanitizePathComponent removes invalid characters from path components
func (fm *FileManager) sanitizePathComponent(component string) string {
	// Remove or replace invalid path characters
	component = strings.ReplaceAll(component, "/", "-")
	component = strings.ReplaceAll(component, "\\", "-")
	component = strings.ReplaceAll(component, ":", "-")
	component = strings.ReplaceAll(component, "*", "-")
	component = strings.ReplaceAll(component, "?", "-")
	component = strings.ReplaceAll(component, "\"", "-")
	component = strings.ReplaceAll(component, "<", "-")
	component = strings.ReplaceAll(component, ">", "-")
	component = strings.ReplaceAll(component, "|", "-")
	
	// Trim whitespace and dots (Windows doesn't like trailing dots)
	component = strings.Trim(component, " .")
	
	// Ensure it's not empty
	if component == "" {
		component = "Unknown"
	}
	
	return component
}

// isDuplicate checks if a file is a duplicate based on size and content hash
func (fm *FileManager) isDuplicate(ctx context.Context, targetPath, sourcePath string) bool {
	// Check if target file exists
	targetInfo, err := os.Stat(targetPath)
	if os.IsNotExist(err) {
		return false
	}
	if err != nil {
		fm.logger.Warnf("Error checking target file: %v", err)
		return false
	}

	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		fm.logger.Warnf("Error checking source file: %v", err)
		return false
	}

	// Quick size check
	if targetInfo.Size() != sourceInfo.Size() {
		return false
	}

	// Content hash comparison for files of same size
	targetHash, err := fm.calculateFileHash(targetPath)
	if err != nil {
		fm.logger.Warnf("Error calculating target hash: %v", err)
		return false
	}

	sourceHash, err := fm.calculateFileHash(sourcePath)
	if err != nil {
		fm.logger.Warnf("Error calculating source hash: %v", err)
		return false
	}

	return targetHash == sourceHash
}

// calculateFileHash calculates SHA256 hash of a file
func (fm *FileManager) calculateFileHash(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", hasher.Sum(nil)), nil
}

// scanFolderForDuplicates scans a folder and builds an inventory for duplicate detection
func (fm *FileManager) scanFolderForDuplicates(folderPath string, inventory map[string][]*FileInfo) error {
	return filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files with errors
		}

		if info.IsDir() {
			return nil
		}

		// Only process supported book formats
		ext := strings.ToLower(filepath.Ext(path))
		if !fm.isSupportedFormat(ext) {
			return nil
		}

		// Calculate file hash
		hash, err := fm.calculateFileHash(path)
		if err != nil {
			fm.logger.Warnf("Error calculating hash for %s: %v", path, err)
			return nil
		}

		fileInfo := &FileInfo{
			Path:     path,
			Size:     info.Size(),
			ModTime:  info.ModTime(),
			Checksum: hash,
		}

		inventory[hash] = append(inventory[hash], fileInfo)
		return nil
	})
}

// scanFolder scans a single folder and indexes new files
func (fm *FileManager) scanFolder(ctx context.Context, folderPath string) (*ScanResult, error) {
	result := &ScanResult{
		StartTime: time.Now(),
		Errors:    []string{},
	}

	err := filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Walk error for %s: %v", path, err))
			return nil
		}

		if info.IsDir() {
			return nil
		}

		result.ScannedFiles++

		// Only process supported book formats
		ext := strings.ToLower(filepath.Ext(path))
		if !fm.isSupportedFormat(ext) {
			return nil
		}

		// Check if file is already in library
		// This would require a more sophisticated approach in a real implementation
		// For now, we'll assume all files are new
		result.NewFiles++

		return nil
	})

	if err != nil {
		return nil, err
	}

	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime)
	return result, nil
}

// addFileToLibrary adds a file to a book in the library
func (fm *FileManager) addFileToLibrary(ctx context.Context, bookID int64, filePath, format string) error {
	// Get format ID
	// This would require a format repository in a real implementation
	formatID := int64(1) // Placeholder

	bookFile := &models.BookFile{
		BookID:        bookID,
		FormatID:      formatID,
		FilePath:      &filePath,
		QualityScore:  75, // Default quality score
		DownloadDate:  timePtr(time.Now()),
		IsPrimary:     false,
		CreatedAt:     time.Now(),
	}

	// Calculate file size
	if info, err := os.Stat(filePath); err == nil {
		bookFile.FileSizeBytes = &info.Size()
	}

	// Calculate checksum
	if checksum, err := fm.calculateFileHash(filePath); err == nil {
		bookFile.Checksum = &checksum
	}

	return fm.bookFileRepo.Create(ctx, bookFile)
}

// isSupportedFormat checks if a file extension is supported
func (fm *FileManager) isSupportedFormat(ext string) bool {
	supportedFormats := []string{".epub", ".pdf", ".mobi", ".azw3", ".txt", ".djvu", ".fb2", ".rtf"}
	for _, format := range supportedFormats {
		if ext == format {
			return true
		}
	}
	return false
}

// Helper function to create time pointer
func timePtr(t time.Time) *time.Time {
	return &t
}

// Data structures for file management

// FileInfo represents information about a file
type FileInfo struct {
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	ModTime  time.Time `json:"mod_time"`
	Checksum string    `json:"checksum"`
}

// DuplicateGroup represents a group of duplicate files
type DuplicateGroup struct {
	Checksum string      `json:"checksum"`
	Files    []*FileInfo `json:"files"`
	Count    int         `json:"count"`
}

// ScanResult represents the result of a library scan
type ScanResult struct {
	StartTime    time.Time     `json:"start_time"`
	EndTime      time.Time     `json:"end_time"`
	Duration     time.Duration `json:"duration"`
	ScannedFiles int           `json:"scanned_files"`
	NewFiles     int           `json:"new_files"`
	UpdatedFiles int           `json:"updated_files"`
	Errors       []string      `json:"errors"`
}