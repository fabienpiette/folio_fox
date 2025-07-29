#!/usr/bin/env python3
"""
FolioFox Book Format Validator and Converter
Comprehensive file format validation, conversion, and optimization for ebooks.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
import os
import shutil
import subprocess
import hashlib
import mimetypes
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set
from dataclasses import dataclass, asdict
from enum import Enum
import yaml
import zipfile
import xml.etree.ElementTree as ET
from PIL import Image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/format_validator.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.format_validator')

class ValidationStatus(Enum):
    VALID = "valid"
    INVALID = "invalid"
    CORRUPTED = "corrupted"
    UNSUPPORTED = "unsupported"
    NEEDS_CONVERSION = "needs_conversion"

class ConversionStatus(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    NOT_NEEDED = "not_needed"
    UNSUPPORTED_FORMAT = "unsupported_format"

class BookFormat(Enum):
    EPUB = "epub"
    PDF = "pdf"
    MOBI = "mobi"
    AZW3 = "azw3"
    TXT = "txt"
    FB2 = "fb2"
    DJVU = "djvu"
    RTF = "rtf"
    HTML = "html"
    DOCX = "docx"

@dataclass
class ValidationResult:
    file_path: str
    format: BookFormat
    status: ValidationStatus
    file_size: int
    checksum: str
    mime_type: str
    metadata: Dict[str, Any]
    issues: List[str]
    quality_score: float
    processing_time_seconds: float

@dataclass
class ConversionResult:
    source_path: str
    target_path: str
    source_format: BookFormat
    target_format: BookFormat
    status: ConversionStatus
    file_size_before: int
    file_size_after: int
    quality_score: float
    conversion_time_seconds: float
    errors: List[str]

class FormatValidator:
    """Comprehensive book format validator and converter."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Processing configuration
        self.temp_dir = Path(self.config.get('processing', {}).get('temp_dir', './temp'))
        self.backup_originals = self.config.get('processing', {}).get('backup_originals', True)
        self.backup_dir = Path(self.config.get('processing', {}).get('backup_dir', './backups'))
        self.max_file_size_mb = self.config.get('processing', {}).get('max_file_size_mb', 500)
        
        # Conversion settings
        self.preferred_formats = self.config.get('conversion', {}).get('preferred_formats', ['epub', 'pdf'])
        self.epub_compression_level = self.config.get('conversion', {}).get('epub_compression_level', 9)
        self.pdf_quality = self.config.get('conversion', {}).get('pdf_quality', 85)
        self.enable_ocr = self.config.get('conversion', {}).get('enable_ocr', False)
        
        # Quality thresholds
        self.min_quality_score = self.config.get('quality', {}).get('min_quality_score', 0.7)
        self.auto_fix_issues = self.config.get('quality', {}).get('auto_fix_issues', True)
        
        # Tool paths
        self.calibre_path = self.config.get('tools', {}).get('calibre_path', 'ebook-convert')
        self.pandoc_path = self.config.get('tools', {}).get('pandoc_path', 'pandoc')
        self.tesseract_path = self.config.get('tools', {}).get('tesseract_path', 'tesseract')
        
        # Create directories
        self.temp_dir.mkdir(exist_ok=True, parents=True)
        if self.backup_originals:
            self.backup_dir.mkdir(exist_ok=True, parents=True)
        
        # Statistics
        self.processing_stats = {
            'files_processed': 0,
            'valid_files': 0,
            'invalid_files': 0,
            'conversions_performed': 0,
            'conversion_success_rate': 0.0,
            'avg_quality_score': 0.0
        }
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with format-specific defaults."""
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                logger.info(f"Configuration loaded from {config_path}")
                return config
        except FileNotFoundError:
            logger.warning(f"Config file {config_path} not found, using defaults")
            return self._get_default_config()
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict:
        """Return default format validation configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'processing': {
                'temp_dir': './temp',
                'backup_originals': True,
                'backup_dir': './backups',
                'max_file_size_mb': 500
            },
            'conversion': {
                'preferred_formats': ['epub', 'pdf'],
                'epub_compression_level': 9,
                'pdf_quality': 85,
                'enable_ocr': False
            },
            'quality': {
                'min_quality_score': 0.7,
                'auto_fix_issues': True
            },
            'tools': {
                'calibre_path': 'ebook-convert',
                'pandoc_path': 'pandoc',
                'tesseract_path': 'tesseract'
            }
        }
    
    def get_database_connection(self) -> sqlite3.Connection:
        """Get database connection with proper configuration."""
        try:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    def get_files_needing_validation(self, limit: int = 100) -> List[Dict]:
        """Get book files that need format validation."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT bf.id, bf.book_id, bf.format_id, bf.file_path, 
                           bf.file_size_bytes, bf.quality_score, bf.checksum,
                           bf.created_at, bf.updated_at,
                           b.title, b.isbn_13,
                           bfmt.name as format_name
                    FROM book_files bf
                    JOIN books b ON bf.book_id = b.id
                    JOIN book_formats bfmt ON bf.format_id = bfmt.id
                    WHERE (
                        bf.checksum IS NULL OR 
                        bf.quality_score IS NULL OR 
                        bf.quality_score < ? OR
                        bf.updated_at < datetime('now', '-7 days')
                    )
                    AND bf.file_path IS NOT NULL
                    AND bf.file_path != ''
                    ORDER BY bf.updated_at ASC
                    LIMIT ?
                """, (self.min_quality_score, limit))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error getting files needing validation: {e}")
            return []
    
    async def validate_file(self, file_info: Dict) -> ValidationResult:
        """Validate a single book file."""
        start_time = time.time()
        file_path = Path(file_info['file_path'])
        
        logger.info(f"Validating file: {file_path}")
        
        # Initialize result
        result = ValidationResult(
            file_path=str(file_path),
            format=BookFormat(file_info['format_name'].lower()),
            status=ValidationStatus.INVALID,
            file_size=0,
            checksum="",
            mime_type="",
            metadata={},
            issues=[],
            quality_score=0.0,
            processing_time_seconds=0.0
        )
        
        try:
            # Check if file exists
            if not file_path.exists():
                result.issues.append("File does not exist")
                result.status = ValidationStatus.INVALID
                return result
            
            # Get file size
            result.file_size = file_path.stat().st_size
            
            # Check file size limits
            if result.file_size > self.max_file_size_mb * 1024 * 1024:
                result.issues.append(f"File size ({result.file_size / 1024 / 1024:.1f}MB) exceeds limit")
                result.status = ValidationStatus.INVALID
                return result
            
            # Calculate checksum
            result.checksum = await self._calculate_checksum(file_path)
            
            # Detect MIME type
            result.mime_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            
            # Format-specific validation
            if result.format == BookFormat.EPUB:
                validation_result = await self._validate_epub(file_path)
            elif result.format == BookFormat.PDF:
                validation_result = await self._validate_pdf(file_path)
            elif result.format == BookFormat.MOBI:
                validation_result = await self._validate_mobi(file_path)
            elif result.format == BookFormat.TXT:
                validation_result = await self._validate_txt(file_path)
            elif result.format == BookFormat.FB2:
                validation_result = await self._validate_fb2(file_path)
            else:
                validation_result = await self._validate_generic(file_path)
            
            # Merge validation results
            result.status = validation_result['status']
            result.metadata.update(validation_result['metadata'])
            result.issues.extend(validation_result['issues'])
            result.quality_score = validation_result['quality_score']
            
            # Update database with validation results
            await self._update_file_validation_results(file_info['id'], result)
            
            logger.info(f"Validation completed for {file_path}: {result.status.value} "
                       f"(quality: {result.quality_score:.2f})")
            
        except Exception as e:
            error_msg = f"Validation error: {str(e)}"
            logger.error(error_msg)
            result.issues.append(error_msg)
            result.status = ValidationStatus.INVALID
        
        result.processing_time_seconds = time.time() - start_time
        return result
    
    async def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of file."""
        hash_sha256 = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        
        return hash_sha256.hexdigest()
    
    async def _validate_epub(self, file_path: Path) -> Dict:
        """Validate EPUB file format."""
        result = {
            'status': ValidationStatus.VALID,
            'metadata': {},
            'issues': [],
            'quality_score': 0.0
        }
        
        try:
            # Check if it's a valid ZIP file
            if not zipfile.is_zipfile(file_path):
                result['status'] = ValidationStatus.CORRUPTED
                result['issues'].append("Not a valid ZIP archive")
                return result
            
            with zipfile.ZipFile(file_path, 'r') as epub:
                # Check for required files
                file_list = epub.namelist()
                
                # Must have mimetype file
                if 'mimetype' not in file_list:
                    result['issues'].append("Missing mimetype file")
                    result['quality_score'] -= 0.2
                else:
                    # Check mimetype content
                    mimetype_content = epub.read('mimetype').decode('utf-8').strip()
                    if mimetype_content != 'application/epub+zip':
                        result['issues'].append(f"Invalid mimetype: {mimetype_content}")
                        result['quality_score'] -= 0.1
                
                # Must have META-INF/container.xml
                if 'META-INF/container.xml' not in file_list:
                    result['issues'].append("Missing META-INF/container.xml")
                    result['quality_score'] -= 0.3
                else:
                    # Parse container.xml to find OPF file
                    try:
                        container_xml = epub.read('META-INF/container.xml')
                        container_root = ET.fromstring(container_xml)
                        
                        # Find rootfile
                        rootfile = container_root.find('.//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile')
                        if rootfile is not None:
                            opf_path = rootfile.get('full-path')
                            result['metadata']['opf_path'] = opf_path
                            
                            # Validate OPF file
                            if opf_path in file_list:
                                opf_validation = await self._validate_epub_opf(epub, opf_path)
                                result['metadata'].update(opf_validation['metadata'])
                                result['issues'].extend(opf_validation['issues'])
                                result['quality_score'] += opf_validation['quality_score']
                            else:
                                result['issues'].append(f"OPF file not found: {opf_path}")
                                result['quality_score'] -= 0.2
                        else:
                            result['issues'].append("No rootfile found in container.xml")
                            result['quality_score'] -= 0.2
                    except ET.ParseError as e:
                        result['issues'].append(f"Invalid container.xml: {str(e)}")
                        result['quality_score'] -= 0.2
                
                # Check for common files
                if any(f.endswith('.html') or f.endswith('.xhtml') for f in file_list):
                    result['quality_score'] += 0.2
                else:
                    result['issues'].append("No HTML/XHTML content files found")
                    result['quality_score'] -= 0.1
                
                # Check for navigation file (EPUB 3)
                if any('nav' in f.lower() for f in file_list):
                    result['metadata']['has_navigation'] = True
                    result['quality_score'] += 0.1
                
                # Check for table of contents
                if 'toc.ncx' in file_list:
                    result['metadata']['has_toc'] = True
                    result['quality_score'] += 0.1
                
                # Basic structure score
                result['quality_score'] += 0.5  # Base score for valid EPUB
                
                # Normalize quality score
                result['quality_score'] = max(0.0, min(1.0, result['quality_score']))
                
                # Set status based on issues
                if len(result['issues']) == 0:
                    result['status'] = ValidationStatus.VALID
                elif result['quality_score'] < 0.3:
                    result['status'] = ValidationStatus.CORRUPTED
                else:
                    result['status'] = ValidationStatus.VALID
                
        except zipfile.BadZipFile:
            result['status'] = ValidationStatus.CORRUPTED
            result['issues'].append("Corrupted ZIP archive")
        except Exception as e:
            result['status'] = ValidationStatus.INVALID
            result['issues'].append(f"EPUB validation error: {str(e)}")
        
        return result
    
    async def _validate_epub_opf(self, epub: zipfile.ZipFile, opf_path: str) -> Dict:
        """Validate EPUB OPF (Open Packaging Format) file."""
        result = {
            'metadata': {},
            'issues': [],
            'quality_score': 0.0
        }
        
        try:
            opf_content = epub.read(opf_path)
            opf_root = ET.fromstring(opf_content)
            
            # Extract metadata
            metadata_elem = opf_root.find('.//{http://www.idpf.org/2007/opf}metadata')
            if metadata_elem is not None:
                # Title
                title_elem = metadata_elem.find('.//{http://purl.org/dc/elements/1.1/}title')
                if title_elem is not None:
                    result['metadata']['title'] = title_elem.text
                    result['quality_score'] += 0.1
                
                # Creator/Author
                creator_elems = metadata_elem.findall('.//{http://purl.org/dc/elements/1.1/}creator')
                if creator_elems:
                    result['metadata']['authors'] = [elem.text for elem in creator_elems if elem.text]
                    result['quality_score'] += 0.1
                
                # Language
                language_elem = metadata_elem.find('.//{http://purl.org/dc/elements/1.1/}language')
                if language_elem is not None:
                    result['metadata']['language'] = language_elem.text
                    result['quality_score'] += 0.05
                
                # Identifier (ISBN)
                identifier_elems = metadata_elem.findall('.//{http://purl.org/dc/elements/1.1/}identifier')
                for elem in identifier_elems:
                    if elem.get('scheme') == 'ISBN' or 'isbn' in (elem.get('id') or '').lower():
                        result['metadata']['isbn'] = elem.text
                        result['quality_score'] += 0.1
                        break
                
                # Description
                description_elem = metadata_elem.find('.//{http://purl.org/dc/elements/1.1/}description')
                if description_elem is not None:
                    result['metadata']['description'] = description_elem.text
                    result['quality_score'] += 0.05
            else:
                result['issues'].append("No metadata section found in OPF")
                result['quality_score'] -= 0.2
            
            # Check manifest
            manifest_elem = opf_root.find('.//{http://www.idpf.org/2007/opf}manifest')
            if manifest_elem is not None:
                items = manifest_elem.findall('.//{http://www.idpf.org/2007/opf}item')
                result['metadata']['manifest_items'] = len(items)
                
                # Check for required media types
                media_types = [item.get('media-type') for item in items]
                if 'application/xhtml+xml' in media_types or 'text/html' in media_types:
                    result['quality_score'] += 0.1
                
                if 'text/css' in media_types:
                    result['quality_score'] += 0.05
                
            else:
                result['issues'].append("No manifest found in OPF")
                result['quality_score'] -= 0.3
            
            # Check spine
            spine_elem = opf_root.find('.//{http://www.idpf.org/2007/opf}spine')
            if spine_elem is not None:
                itemrefs = spine_elem.findall('.//{http://www.idpf.org/2007/opf}itemref')
                result['metadata']['spine_items'] = len(itemrefs)
                
                if len(itemrefs) > 0:
                    result['quality_score'] += 0.1
            else:
                result['issues'].append("No spine found in OPF")
                result['quality_score'] -= 0.3
                
        except ET.ParseError as e:
            result['issues'].append(f"Invalid OPF XML: {str(e)}")
            result['quality_score'] -= 0.5
        except Exception as e:
            result['issues'].append(f"OPF validation error: {str(e)}")
            result['quality_score'] -= 0.3
        
        return result
    
    async def _validate_pdf(self, file_path: Path) -> Dict:
        """Validate PDF file format."""
        result = {
            'status': ValidationStatus.VALID,
            'metadata': {},
            'issues': [],
            'quality_score': 0.5  # Base score for PDF
        }
        
        try:
            # Check PDF header
            with open(file_path, 'rb') as f:
                header = f.read(8)
                if not header.startswith(b'%PDF-'):
                    result['status'] = ValidationStatus.CORRUPTED
                    result['issues'].append("Invalid PDF header")
                    result['quality_score'] = 0.0
                    return result
                
                # Extract PDF version
                version = header[5:8].decode('ascii', errors='ignore')
                result['metadata']['pdf_version'] = version
                
                # Check for EOF marker
                f.seek(-1024, 2)  # Go to near end of file
                end_content = f.read()
                if b'%%EOF' not in end_content:
                    result['issues'].append("Missing EOF marker")
                    result['quality_score'] -= 0.1
            
            # Try to extract metadata using pdfinfo if available
            try:
                pdfinfo_result = subprocess.run(
                    ['pdfinfo', str(file_path)],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if pdfinfo_result.returncode == 0:
                    # Parse pdfinfo output
                    for line in pdfinfo_result.stdout.split('\n'):
                        if ':' in line:
                            key, value = line.split(':', 1)
                            key = key.strip().lower().replace(' ', '_')
                            value = value.strip()
                            
                            if value:
                                result['metadata'][key] = value
                    
                    # Quality scoring based on metadata
                    if 'title' in result['metadata']:
                        result['quality_score'] += 0.1
                    if 'author' in result['metadata']:
                        result['quality_score'] += 0.1
                    if 'pages' in result['metadata']:
                        try:
                            pages = int(result['metadata']['pages'])
                            result['metadata']['page_count'] = pages
                            if pages > 0:
                                result['quality_score'] += 0.1
                        except ValueError:
                            pass
                    
                    # Check if PDF is searchable (has text)
                    if 'tagged' in result['metadata'] and result['metadata']['tagged'] == 'yes':
                        result['quality_score'] += 0.1
                    
                else:
                    result['issues'].append("Could not extract PDF metadata")
                    result['quality_score'] -= 0.1
                    
            except FileNotFoundError:
                # pdfinfo not available
                result['issues'].append("pdfinfo tool not available for detailed validation")
            except subprocess.TimeoutExpired:
                result['issues'].append("PDF metadata extraction timed out")
            except Exception as e:
                result['issues'].append(f"PDF metadata extraction error: {str(e)}")
            
            # Normalize quality score
            result['quality_score'] = max(0.0, min(1.0, result['quality_score']))
            
        except Exception as e:
            result['status'] = ValidationStatus.INVALID
            result['issues'].append(f"PDF validation error: {str(e)}")
            result['quality_score'] = 0.0
        
        return result
    
    async def _validate_mobi(self, file_path: Path) -> Dict:
        """Validate MOBI file format."""
        result = {
            'status': ValidationStatus.VALID,
            'metadata': {},
            'issues': [],
            'quality_score': 0.5  # Base score for MOBI
        }
        
        try:
            with open(file_path, 'rb') as f:
                # Check MOBI header
                header = f.read(68)
                
                # MOBI files start with PalmDOC header
                if len(header) < 68:
                    result['status'] = ValidationStatus.CORRUPTED
                    result['issues'].append("File too short to be valid MOBI")
                    return result
                
                # Check for MOBI signature
                f.seek(60)
                mobi_header = f.read(4)
                if mobi_header == b'MOBI':
                    result['metadata']['format'] = 'MOBI'
                    result['quality_score'] += 0.2
                elif mobi_header == b'BOOK':
                    result['metadata']['format'] = 'PalmDOC'
                    result['quality_score'] += 0.1
                else:
                    result['status'] = ValidationStatus.INVALID
                    result['issues'].append("Invalid MOBI header signature")
                    return result
                
                # Try to extract basic metadata
                f.seek(0)
                palm_header = f.read(78)
                
                # Database name (first 32 bytes)
                db_name = palm_header[:32].rstrip(b'\x00').decode('ascii', errors='ignore')
                if db_name:
                    result['metadata']['title'] = db_name
                    result['quality_score'] += 0.1
                
        except Exception as e:
            result['status'] = ValidationStatus.INVALID  
            result['issues'].append(f"MOBI validation error: {str(e)}")
            result['quality_score'] = 0.0
        
        return result
    
    async def _validate_txt(self, file_path: Path) -> Dict:
        """Validate plain text file."""
        result = {
            'status': ValidationStatus.VALID,
            'metadata': {},
            'issues': [],
            'quality_score': 0.3  # Base score for TXT (lower than structured formats)
        }
        
        try:
            # Try to detect encoding and read file
            encodings = ['utf-8', 'utf-16', 'iso-8859-1', 'cp1252']
            content = None
            encoding_used = None
            
            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding) as f:
                        content = f.read(1000)  # Read first 1000 characters
                        encoding_used = encoding
                        break
                except UnicodeDecodeError:
                    continue
            
            if content is None:
                result['status'] = ValidationStatus.INVALID
                result['issues'].append("Could not decode text file with any common encoding")
                return result
            
            result['metadata']['encoding'] = encoding_used
            result['metadata']['character_count'] = len(content)
            
            # Check for reasonable text content
            if len(content.strip()) == 0:
                result['issues'].append("File appears to be empty")
                result['quality_score'] -= 0.2
            
            # Check for binary content (non-printable characters)
            printable_chars = sum(1 for c in content if c.isprintable() or c.isspace())
            printable_ratio = printable_chars / len(content) if content else 0
            
            if printable_ratio < 0.8:
                result['issues'].append("File contains significant non-printable content")
                result['quality_score'] -= 0.3
            else:
                result['quality_score'] += 0.2
            
            # Check for structure indicators
            if any(indicator in content.lower() for indicator in ['chapter', 'section', 'part']):
                result['quality_score'] += 0.1
                result['metadata']['has_structure'] = True
            
        except Exception as e:
            result['status'] = ValidationStatus.INVALID
            result['issues'].append(f"TXT validation error: {str(e)}")
            result['quality_score'] = 0.0
        
        return result
    
    async def _validate_fb2(self, file_path: Path) -> Dict:
        """Validate FB2 (FictionBook) file format."""
        result = {
            'status': ValidationStatus.VALID,
            'metadata': {},
            'issues': [],
            'quality_score': 0.5  # Base score for FB2
        }
        
        try:
            # FB2 files are XML
            with open(file_path, 'rb') as f:
                # Check if it might be compressed
                header = f.read(10)
                if header.startswith(b'\x1f\x8b'):  # gzip header
                    result['issues'].append("FB2 file appears to be compressed (FB2.zip)")
                    result['status'] = ValidationStatus.NEEDS_CONVERSION
                    return result
            
            # Parse as XML
            try:
                tree = ET.parse(file_path)
                root = tree.getroot()
                
                # Check root element
                if not root.tag.endswith('FictionBook'):
                    result['status'] = ValidationStatus.INVALID
                    result['issues'].append("Root element is not FictionBook")
                    return result
                
                result['quality_score'] += 0.2
                
                # Look for description section
                description = root.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}description')
                if description is not None:
                    result['quality_score'] += 0.1
                    
                    # Extract metadata
                    title_info = description.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}title-info')
                    if title_info is not None:
                        # Book title
                        book_title = title_info.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}book-title')
                        if book_title is not None and book_title.text:
                            result['metadata']['title'] = book_title.text
                            result['quality_score'] += 0.1
                        
                        # Authors
                        authors = title_info.findall('.//{http://www.gribuser.ru/xml/fictionbook/2.0}author')
                        if authors:
                            author_names = []
                            for author in authors:
                                first_name = author.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}first-name')
                                last_name = author.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}last-name')
                                
                                name_parts = []
                                if first_name is not None and first_name.text:
                                    name_parts.append(first_name.text)
                                if last_name is not None and last_name.text:
                                    name_parts.append(last_name.text)
                                
                                if name_parts:
                                    author_names.append(' '.join(name_parts))
                            
                            if author_names:
                                result['metadata']['authors'] = author_names
                                result['quality_score'] += 0.1
                        
                        # Genre
                        genres = title_info.findall('.//{http://www.gribuser.ru/xml/fictionbook/2.0}genre')
                        if genres:
                            result['metadata']['genres'] = [g.text for g in genres if g.text]
                            result['quality_score'] += 0.05
                        
                        # Annotation
                        annotation = title_info.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}annotation')
                        if annotation is not None:
                            result['quality_score'] += 0.05
                
                # Look for body section
                body = root.find('.//{http://www.gribuser.ru/xml/fictionbook/2.0}body')
                if body is not None:
                    result['quality_score'] += 0.2
                    
                    # Count sections
                    sections = body.findall('.//{http://www.gribuser.ru/xml/fictionbook/2.0}section')
                    result['metadata']['section_count'] = len(sections)
                    
                    if len(sections) > 0:
                        result['quality_score'] += 0.1
                else:
                    result['issues'].append("No body section found")
                    result['quality_score'] -= 0.2
                
            except ET.ParseError as e:
                result['status'] = ValidationStatus.CORRUPTED
                result['issues'].append(f"Invalid XML structure: {str(e)}")
                result['quality_score'] = 0.0
                
        except Exception as e:
            result['status'] = ValidationStatus.INVALID
            result['issues'].append(f"FB2 validation error: {str(e)}")
            result['quality_score'] = 0.0
        
        return result
    
    async def _validate_generic(self, file_path: Path) -> Dict:
        """Generic validation for unsupported formats."""
        result = {
            'status': ValidationStatus.UNSUPPORTED,
            'metadata': {},
            'issues': ['Format not specifically supported'],
            'quality_score': 0.1  # Minimal score for existing file
        }
        
        try:
            # Basic file checks
            stat = file_path.stat()
            result['metadata']['file_size'] = stat.st_size
            result['metadata']['modified_time'] = stat.st_mtime
            
            # Try to determine if it's a text-based format
            with open(file_path, 'rb') as f:
                sample = f.read(1024)
                
                # Check if mostly text
                try:
                    sample.decode('utf-8')
                    result['metadata']['likely_text_based'] = True
                    result['quality_score'] += 0.1
                except UnicodeDecodeError:
                    result['metadata']['likely_text_based'] = False
                
                # Check for common file signatures
                if sample.startswith(b'PK'):
                    result['metadata']['archive_based'] = True
                    result['issues'].append("Appears to be archive-based format")
                
        except Exception as e:
            result['issues'].append(f"Generic validation error: {str(e)}")
        
        return result
    
    async def _update_file_validation_results(self, file_id: int, result: ValidationResult):
        """Update database with validation results."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE book_files 
                    SET checksum = ?, quality_score = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    result.checksum,
                    result.quality_score,
                    datetime.now().isoformat(),
                    file_id
                ))
                
                conn.commit()
                logger.debug(f"Updated validation results for file ID {file_id}")
                
        except Exception as e:
            logger.error(f"Error updating validation results: {e}")
    
    async def convert_file(self, source_path: str, target_format: BookFormat, 
                          options: Dict = None) -> ConversionResult:
        """Convert book file to target format."""
        start_time = time.time()
        source_path = Path(source_path)
        
        # Determine source format
        source_format = self._detect_format_from_path(source_path)
        
        # Generate target path
        target_path = source_path.with_suffix(f".{target_format.value}")
        if target_path == source_path:
            target_path = source_path.parent / f"{source_path.stem}_converted.{target_format.value}"
        
        result = ConversionResult(
            source_path=str(source_path),
            target_path=str(target_path),
            source_format=source_format,
            target_format=target_format,
            status=ConversionStatus.FAILED,
            file_size_before=source_path.stat().st_size if source_path.exists() else 0,
            file_size_after=0,
            quality_score=0.0,
            conversion_time_seconds=0.0,
            errors=[]
        )
        
        try:
            # Check if conversion is needed
            if source_format == target_format:
                result.status = ConversionStatus.NOT_NEEDED
                result.target_path = str(source_path)
                result.file_size_after = result.file_size_before
                result.quality_score = 1.0
                return result
            
            # Backup original if enabled
            if self.backup_originals:
                backup_path = self.backup_dir / f"{source_path.name}.backup"
                shutil.copy2(source_path, backup_path)
                logger.info(f"Backed up original file to {backup_path}")
            
            # Perform conversion based on source and target formats
            conversion_success = False
            
            # Try Calibre first (most comprehensive)
            if self._is_calibre_available():
                conversion_success = await self._convert_with_calibre(
                    source_path, target_path, target_format, options or {}
                )
                if not conversion_success:
                    result.errors.append("Calibre conversion failed")
            
            # Fallback to Pandoc for text-based formats
            if not conversion_success and self._is_pandoc_available():
                if target_format in [BookFormat.EPUB, BookFormat.HTML] and \
                   source_format in [BookFormat.TXT, BookFormat.HTML, BookFormat.DOCX]:
                    conversion_success = await self._convert_with_pandoc(
                        source_path, target_path, target_format, options or {}
                    )
                    if not conversion_success:
                        result.errors.append("Pandoc conversion failed")
            
            # Check if conversion was successful
            if conversion_success and target_path.exists():
                result.status = ConversionStatus.SUCCESS
                result.file_size_after = target_path.stat().st_size
                
                # Validate converted file
                validation_result = await self.validate_file({
                    'id': 0,  # Dummy ID for validation
                    'file_path': str(target_path),
                    'format_name': target_format.value
                })
                
                result.quality_score = validation_result.quality_score
                
                if validation_result.status == ValidationStatus.CORRUPTED:
                    result.errors.append("Converted file failed validation")
                    result.quality_score = 0.0
                
                logger.info(f"Successfully converted {source_path} to {target_path}")
            else:
                result.status = ConversionStatus.FAILED
                result.errors.append("Conversion produced no output file")
                
        except Exception as e:
            error_msg = f"Conversion error: {str(e)}"
            logger.error(error_msg)
            result.errors.append(error_msg)
            result.status = ConversionStatus.FAILED
        
        result.conversion_time_seconds = time.time() - start_time
        return result
    
    def _detect_format_from_path(self, file_path: Path) -> BookFormat:
        """Detect book format from file extension."""
        suffix = file_path.suffix.lower().lstrip('.')
        
        format_mapping = {
            'epub': BookFormat.EPUB,
            'pdf': BookFormat.PDF,
            'mobi': BookFormat.MOBI,
            'azw3': BookFormat.AZW3,
            'txt': BookFormat.TXT,
            'fb2': BookFormat.FB2,
            'djvu': BookFormat.DJVU,
            'rtf': BookFormat.RTF,
            'html': BookFormat.HTML,
            'htm': BookFormat.HTML,
            'docx': BookFormat.DOCX,
        }
        
        return format_mapping.get(suffix, BookFormat.TXT)
    
    def _is_calibre_available(self) -> bool:
        """Check if Calibre is available."""
        try:
            subprocess.run([self.calibre_path, '--version'], 
                         capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def _is_pandoc_available(self) -> bool:
        """Check if Pandoc is available."""
        try:
            subprocess.run([self.pandoc_path, '--version'], 
                         capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    async def _convert_with_calibre(self, source_path: Path, target_path: Path, 
                                   target_format: BookFormat, options: Dict) -> bool:
        """Convert file using Calibre."""
        try:
            cmd = [self.calibre_path, str(source_path), str(target_path)]
            
            # Add format-specific options
            if target_format == BookFormat.EPUB:
                cmd.extend(['--preserve-cover-aspect-ratio'])
                if options.get('compress', True):
                    cmd.extend(['--epub-inline-toc'])
                
            elif target_format == BookFormat.PDF:
                cmd.extend(['--pdf-page-numbers'])
                if 'pdf_quality' in options:
                    cmd.extend(['--pdf-default-image-quality', str(options['pdf_quality'])])
            
            # Run conversion
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=300)
            
            if process.returncode == 0:
                return True
            else:
                logger.error(f"Calibre conversion failed: {stderr.decode()}")
                return False
                
        except asyncio.TimeoutError:
            logger.error("Calibre conversion timed out")
            return False
        except Exception as e:
            logger.error(f"Calibre conversion error: {e}")
            return False
    
    async def _convert_with_pandoc(self, source_path: Path, target_path: Path, 
                                  target_format: BookFormat, options: Dict) -> bool:
        """Convert file using Pandoc."""
        try:
            cmd = [self.pandoc_path, str(source_path), '-o', str(target_path)]
            
            # Add format-specific options
            if target_format == BookFormat.EPUB:
                cmd.extend(['--to', 'epub3'])
                if options.get('toc', True):
                    cmd.extend(['--toc'])
            elif target_format == BookFormat.HTML:
                cmd.extend(['--to', 'html5'])
                cmd.extend(['--standalone'])
            
            # Run conversion
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=180)
            
            if process.returncode == 0:
                return True
            else:
                logger.error(f"Pandoc conversion failed: {stderr.decode()}")
                return False
                
        except asyncio.TimeoutError:
            logger.error("Pandoc conversion timed out")
            return False
        except Exception as e:
            logger.error(f"Pandoc conversion error: {e}")
            return False
    
    async def process_batch(self, limit: int = 50) -> Dict:
        """Process a batch of files needing validation."""
        logger.info(f"Starting batch validation (limit: {limit})")
        
        files_to_process = self.get_files_needing_validation(limit)
        if not files_to_process:
            logger.info("No files need validation")
            return {'processed': 0, 'valid': 0, 'invalid': 0}
        
        logger.info(f"Processing {len(files_to_process)} files")
        
        results = []
        for file_info in files_to_process:
            try:
                result = await self.validate_file(file_info)
                results.append(result)
                
                # Update statistics
                self.processing_stats['files_processed'] += 1
                if result.status == ValidationStatus.VALID:
                    self.processing_stats['valid_files'] += 1
                else:
                    self.processing_stats['invalid_files'] += 1
                
            except Exception as e:
                logger.error(f"Error processing file {file_info['file_path']}: {e}")
                self.processing_stats['invalid_files'] += 1
        
        # Calculate averages
        valid_results = [r for r in results if r.status == ValidationStatus.VALID]
        if valid_results:
            avg_quality = sum(r.quality_score for r in valid_results) / len(valid_results)
            self.processing_stats['avg_quality_score'] = avg_quality
        
        summary = {
            'processed': len(results),
            'valid': sum(1 for r in results if r.status == ValidationStatus.VALID),
            'invalid': sum(1 for r in results if r.status != ValidationStatus.VALID),
            'avg_quality_score': self.processing_stats['avg_quality_score']
        }
        
        logger.info(f"Batch validation completed: {summary}")
        return summary
    
    def generate_validation_report(self) -> Dict:
        """Generate comprehensive validation report."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # File format distribution
                cursor.execute("""
                    SELECT bf.name as format, COUNT(*) as count,
                           AVG(bf2.quality_score) as avg_quality
                    FROM book_formats bf
                    LEFT JOIN book_files bf2 ON bf.id = bf2.format_id
                    GROUP BY bf.id, bf.name
                    ORDER BY count DESC
                """)
                
                format_stats = [dict(row) for row in cursor.fetchall()]
                
                # Files needing attention
                cursor.execute("""
                    SELECT COUNT(*) as files_needing_validation
                    FROM book_files 
                    WHERE quality_score IS NULL OR quality_score < ?
                """, (self.min_quality_score,))
                
                needs_validation = cursor.fetchone()[0]
                
                # Recent validation activity
                cursor.execute("""
                    SELECT COUNT(*) as recently_validated
                    FROM book_files 
                    WHERE updated_at > datetime('now', '-7 days')
                    AND quality_score IS NOT NULL
                """)
                
                recently_validated = cursor.fetchone()[0]
                
                return {
                    'timestamp': datetime.now().isoformat(),
                    'summary': {
                        'files_needing_validation': needs_validation,
                        'recently_validated': recently_validated,
                        'supported_formats': len([f for f in format_stats if f['count'] > 0])
                    },
                    'format_distribution': format_stats,
                    'processing_statistics': self.processing_stats,
                    'configuration': {
                        'min_quality_score': self.min_quality_score,
                        'max_file_size_mb': self.max_file_size_mb,
                        'backup_originals': self.backup_originals,
                        'auto_fix_issues': self.auto_fix_issues
                    }
                }
                
        except Exception as e:
            logger.error(f"Error generating validation report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}


def main():
    parser = argparse.ArgumentParser(description='FolioFox Book Format Validator')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['batch', 'single', 'convert', 'report'], default='batch',
                       help='Operation mode')
    parser.add_argument('--file-path', help='File path for single mode')
    parser.add_argument('--target-format', choices=[f.value for f in BookFormat], 
                       help='Target format for conversion')
    parser.add_argument('--limit', type=int, default=50, help='Batch processing limit')
    
    args = parser.parse_args()
    
    validator = FormatValidator(args.config)
    
    if args.mode == 'single':
        if not args.file_path:
            print("--file-path required for single mode")
            sys.exit(1)
        
        # Validate single file
        async def validate_single():
            file_info = {
                'id': 0,
                'file_path': args.file_path,
                'format_name': validator._detect_format_from_path(Path(args.file_path)).value
            }
            result = await validator.validate_file(file_info)
            print(json.dumps(asdict(result), indent=2, default=str))
        
        asyncio.run(validate_single())
        
    elif args.mode == 'convert':
        if not args.file_path or not args.target_format:
            print("--file-path and --target-format required for convert mode")
            sys.exit(1)
        
        # Convert file
        async def convert_single():
            target_format = BookFormat(args.target_format)
            result = await validator.convert_file(args.file_path, target_format)
            print(json.dumps(asdict(result), indent=2, default=str))
        
        asyncio.run(convert_single())
        
    elif args.mode == 'report':
        # Generate and print report
        report = validator.generate_validation_report()
        print(json.dumps(report, indent=2, default=str))
        
    else:
        # Batch validation
        async def run_batch():
            return await validator.process_batch(args.limit)
        
        summary = asyncio.run(run_batch())
        print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()