#!/usr/bin/env python3
"""
FolioFox Duplicate Book Detector
Advanced duplicate detection and cleanup with fuzzy matching and smart merging.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set
from dataclasses import dataclass, asdict
from enum import Enum
import yaml
import difflib
from collections import defaultdict
import unicodedata

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/duplicate_detector.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.duplicate_detector')

class DuplicateType(Enum):
    EXACT_MATCH = "exact_match"
    FUZZY_MATCH = "fuzzy_match"
    ISBN_MATCH = "isbn_match"
    CONTENT_HASH_MATCH = "content_hash_match"
    SIMILAR_TITLE_AUTHOR = "similar_title_author"

class MatchConfidence(Enum):
    HIGH = "high"
    MEDIUM = "medium" 
    LOW = "low"

class MergeAction(Enum):
    KEEP_FIRST = "keep_first"
    KEEP_SECOND = "keep_second"
    MERGE_METADATA = "merge_metadata"
    MANUAL_REVIEW = "manual_review"

@dataclass
class BookRecord:
    id: int
    title: str
    subtitle: Optional[str]
    authors: List[str]
    isbn_10: Optional[str]
    isbn_13: Optional[str]
    asin: Optional[str]
    description: Optional[str]
    publication_date: Optional[str]
    publisher: Optional[str]
    language: Optional[str]
    page_count: Optional[int]
    rating_average: Optional[float]
    rating_count: Optional[int]
    series: Optional[str]
    series_position: Optional[float]
    genres: List[str]
    tags: List[str]
    file_count: int
    total_file_size: int
    created_at: datetime
    updated_at: datetime

@dataclass
class DuplicateMatch:
    book1: BookRecord
    book2: BookRecord
    duplicate_type: DuplicateType
    confidence: MatchConfidence
    similarity_score: float
    matching_fields: List[str]
    differences: Dict[str, Tuple[Any, Any]]
    recommended_action: MergeAction
    merge_priority_book_id: int

@dataclass
class DuplicateGroup:
    group_id: str
    primary_book: BookRecord
    duplicate_books: List[BookRecord]
    total_matches: int
    highest_confidence: MatchConfidence
    recommended_primary: BookRecord
    merge_suggestions: List[Dict]

class DuplicateDetector:
    """Advanced duplicate detection and management system."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # Detection configuration
        self.fuzzy_threshold = self.config.get('duplicates', {}).get('fuzzy_threshold', 0.85)
        self.title_similarity_threshold = self.config.get('duplicates', {}).get('title_similarity_threshold', 0.9)
        self.author_similarity_threshold = self.config.get('duplicates', {}).get('author_similarity_threshold', 0.8)
        self.enable_isbn_matching = self.config.get('duplicates', {}).get('enable_isbn_matching', True)
        self.enable_content_hash_matching = self.config.get('duplicates', {}).get('enable_content_hash_matching', True)
        
        # Processing limits
        self.max_comparison_batch = self.config.get('duplicates', {}).get('max_comparison_batch', 1000)
        self.similarity_cache_size = self.config.get('duplicates', {}).get('similarity_cache_size', 10000)
        
        # Auto-merge settings
        self.auto_merge_exact_matches = self.config.get('duplicates', {}).get('auto_merge_exact_matches', False)
        self.auto_merge_high_confidence = self.config.get('duplicates', {}).get('auto_merge_high_confidence', False)
        self.require_manual_review_threshold = self.config.get('duplicates', {}).get('manual_review_threshold', 0.7)
        
        # Caches
        self.similarity_cache: Dict[str, float] = {}
        self.normalized_title_cache: Dict[str, str] = {}
        
        # Statistics
        self.detection_stats = {
            'books_scanned': 0,
            'duplicates_found': 0,
            'exact_matches': 0,
            'fuzzy_matches': 0,
            'isbn_matches': 0,
            'auto_merged': 0,
            'manual_review_required': 0
        }
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with duplicate-specific defaults."""
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
        """Return default duplicate detection configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'duplicates': {
                'fuzzy_threshold': 0.85,
                'title_similarity_threshold': 0.9,
                'author_similarity_threshold': 0.8,
                'enable_isbn_matching': True,
                'enable_content_hash_matching': True,
                'max_comparison_batch': 1000,
                'similarity_cache_size': 10000,
                'auto_merge_exact_matches': False,
                'auto_merge_high_confidence': False,
                'manual_review_threshold': 0.7
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
    
    def get_books_for_duplicate_detection(self, limit: int = None) -> List[BookRecord]:
        """Get books for duplicate detection analysis."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                query = """
                    SELECT b.id, b.title, b.subtitle, b.description, 
                           b.isbn_10, b.isbn_13, b.asin, b.publication_date,
                           b.page_count, b.rating_average, b.rating_count,
                           b.series_position, b.tags, b.created_at, b.updated_at,
                           GROUP_CONCAT(DISTINCT a.name, '; ') as authors,
                           s.name as series_name,
                           l.code as language_code,
                           p.name as publisher_name,
                           GROUP_CONCAT(DISTINCT g.name, '; ') as genres,
                           COUNT(bf.id) as file_count,
                           COALESCE(SUM(bf.file_size_bytes), 0) as total_file_size
                    FROM books b
                    LEFT JOIN book_authors ba ON b.id = ba.book_id
                    LEFT JOIN authors a ON ba.author_id = a.id
                    LEFT JOIN series s ON b.series_id = s.id
                    LEFT JOIN languages l ON b.language_id = l.id
                    LEFT JOIN publishers p ON b.publisher_id = p.id
                    LEFT JOIN book_genres bg ON b.id = bg.book_id
                    LEFT JOIN genres g ON bg.genre_id = g.id
                    LEFT JOIN book_files bf ON b.id = bf.book_id
                    GROUP BY b.id
                    ORDER BY b.updated_at DESC
                """
                
                if limit:
                    query += f" LIMIT {limit}"
                
                cursor.execute(query)
                rows = cursor.fetchall()
                
                books = []
                for row in rows:
                    book = BookRecord(
                        id=row['id'],
                        title=row['title'] or '',
                        subtitle=row['subtitle'],
                        authors=row['authors'].split('; ') if row['authors'] else [],
                        isbn_10=row['isbn_10'],
                        isbn_13=row['isbn_13'],
                        asin=row['asin'],
                        description=row['description'],
                        publication_date=row['publication_date'],
                        publisher=row['publisher_name'],
                        language=row['language_code'],
                        page_count=row['page_count'],
                        rating_average=row['rating_average'],
                        rating_count=row['rating_count'],
                        series=row['series_name'],
                        series_position=row['series_position'],
                        genres=row['genres'].split('; ') if row['genres'] else [],
                        tags=json.loads(row['tags']) if row['tags'] else [],
                        file_count=row['file_count'],
                        total_file_size=row['total_file_size'],
                        created_at=datetime.fromisoformat(row['created_at']),
                        updated_at=datetime.fromisoformat(row['updated_at'])
                    )
                    books.append(book)
                
                return books
                
        except Exception as e:
            logger.error(f"Error getting books for duplicate detection: {e}")
            return []
    
    async def detect_duplicates(self, books: List[BookRecord] = None) -> List[DuplicateMatch]:
        """Detect duplicate books using multiple matching strategies."""
        if books is None:
            books = self.get_books_for_duplicate_detection(self.max_comparison_batch)
        
        logger.info(f"Starting duplicate detection for {len(books)} books")
        
        duplicates = []
        
        # Create indices for efficient lookups
        isbn_index = self._build_isbn_index(books)
        asin_index = self._build_asin_index(books)
        title_author_index = self._build_title_author_index(books)
        
        # Process books in batches to manage memory
        for i, book1 in enumerate(books):
            if i % 100 == 0:
                logger.info(f"Processing book {i+1}/{len(books)}")
            
            self.detection_stats['books_scanned'] += 1
            
            # 1. Exact ISBN matches
            if self.enable_isbn_matching:
                isbn_duplicates = await self._find_isbn_duplicates(book1, isbn_index, books)
                duplicates.extend(isbn_duplicates)
            
            # 2. ASIN matches
            asin_duplicates = await self._find_asin_duplicates(book1, asin_index, books)
            duplicates.extend(asin_duplicates)
            
            # 3. Title + Author fuzzy matches
            fuzzy_duplicates = await self._find_fuzzy_title_author_matches(
                book1, title_author_index, books, i
            )
            duplicates.extend(fuzzy_duplicates)
            
            # 4. Content hash matches (if enabled)
            if self.enable_content_hash_matching:
                content_duplicates = await self._find_content_hash_duplicates(book1, books, i)
                duplicates.extend(content_duplicates)
        
        # Remove duplicates from the duplicates list itself
        unique_duplicates = self._deduplicate_matches(duplicates)
        
        # Sort by confidence and similarity score
        unique_duplicates.sort(key=lambda x: (x.confidence.value, x.similarity_score), reverse=True)
        
        logger.info(f"Found {len(unique_duplicates)} potential duplicate pairs")
        return unique_duplicates
    
    def _build_isbn_index(self, books: List[BookRecord]) -> Dict[str, List[BookRecord]]:
        """Build index of books by ISBN for efficient lookup."""
        index = defaultdict(list)
        
        for book in books:
            if book.isbn_10:
                index[self._normalize_isbn(book.isbn_10)].append(book)
            if book.isbn_13:
                index[self._normalize_isbn(book.isbn_13)].append(book)
        
        return dict(index)
    
    def _build_asin_index(self, books: List[BookRecord]) -> Dict[str, List[BookRecord]]:
        """Build index of books by ASIN for efficient lookup."""
        index = defaultdict(list)
        
        for book in books:
            if book.asin:
                index[book.asin].append(book)
        
        return dict(index)
    
    def _build_title_author_index(self, books: List[BookRecord]) -> Dict[str, List[BookRecord]]:
        """Build index of books by normalized title and author for fuzzy matching."""
        index = defaultdict(list)
        
        for book in books:
            # Create multiple index keys for better matching
            title_normalized = self._normalize_title(book.title)
            
            # Index by title alone
            index[title_normalized].append(book)
            
            # Index by title + primary author
            if book.authors:
                primary_author = self._normalize_author(book.authors[0])
                combined_key = f"{title_normalized}::{primary_author}"
                index[combined_key].append(book)
        
        return dict(index)
    
    async def _find_isbn_duplicates(self, book: BookRecord, isbn_index: Dict[str, List[BookRecord]], 
                                   all_books: List[BookRecord]) -> List[DuplicateMatch]:
        """Find duplicates based on ISBN matching."""
        duplicates = []
        
        isbns_to_check = []
        if book.isbn_10:
            isbns_to_check.append(self._normalize_isbn(book.isbn_10))
        if book.isbn_13:
            isbns_to_check.append(self._normalize_isbn(book.isbn_13))
        
        for isbn in isbns_to_check:
            if isbn in isbn_index:
                for candidate in isbn_index[isbn]:
                    if candidate.id != book.id:
                        # Calculate similarity for additional validation
                        similarity_score = self._calculate_overall_similarity(book, candidate)
                        
                        match = DuplicateMatch(
                            book1=book,
                            book2=candidate,
                            duplicate_type=DuplicateType.ISBN_MATCH,
                            confidence=MatchConfidence.HIGH,
                            similarity_score=similarity_score,
                            matching_fields=['isbn'],
                            differences=self._find_metadata_differences(book, candidate),
                            recommended_action=self._recommend_merge_action(book, candidate),
                            merge_priority_book_id=self._select_primary_book(book, candidate).id
                        )
                        
                        duplicates.append(match)
                        self.detection_stats['isbn_matches'] += 1
        
        return duplicates
    
    async def _find_asin_duplicates(self, book: BookRecord, asin_index: Dict[str, List[BookRecord]], 
                                   all_books: List[BookRecord]) -> List[DuplicateMatch]:
        """Find duplicates based on ASIN matching."""
        duplicates = []
        
        if book.asin and book.asin in asin_index:
            for candidate in asin_index[book.asin]:
                if candidate.id != book.id:
                    similarity_score = self._calculate_overall_similarity(book, candidate)
                    
                    match = DuplicateMatch(
                        book1=book,
                        book2=candidate,
                        duplicate_type=DuplicateType.EXACT_MATCH,
                        confidence=MatchConfidence.HIGH,
                        similarity_score=similarity_score,
                        matching_fields=['asin'],
                        differences=self._find_metadata_differences(book, candidate),
                        recommended_action=self._recommend_merge_action(book, candidate),
                        merge_priority_book_id=self._select_primary_book(book, candidate).id
                    )
                    
                    duplicates.append(match)
        
        return duplicates
    
    async def _find_fuzzy_title_author_matches(self, book: BookRecord, 
                                             title_author_index: Dict[str, List[BookRecord]], 
                                             all_books: List[BookRecord], 
                                             current_index: int) -> List[DuplicateMatch]:
        """Find duplicates using fuzzy title and author matching."""
        duplicates = []
        title_normalized = self._normalize_title(book.title)
        
        # Compare with remaining books to avoid duplicate comparisons
        for candidate in all_books[current_index + 1:]:
            # Skip if already found exact matches
            if self._has_exact_identifiers_match(book, candidate):
                continue
            
            # Calculate title similarity
            candidate_title_normalized = self._normalize_title(candidate.title)
            title_similarity = self._calculate_string_similarity(title_normalized, candidate_title_normalized)
            
            # Calculate author similarity
            author_similarity = self._calculate_author_similarity(book.authors, candidate.authors)
            
            # Combined similarity score
            combined_similarity = (title_similarity * 0.7) + (author_similarity * 0.3)
            
            if combined_similarity >= self.fuzzy_threshold:
                # Determine confidence level
                confidence = MatchConfidence.HIGH if combined_similarity >= 0.95 else \
                           MatchConfidence.MEDIUM if combined_similarity >= 0.85 else \
                           MatchConfidence.LOW
                
                # Find all matching and differing fields
                matching_fields = []
                if title_similarity >= self.title_similarity_threshold:
                    matching_fields.append('title')
                if author_similarity >= self.author_similarity_threshold:
                    matching_fields.append('authors')
                
                # Check other fields for additional matches
                if book.publication_date and candidate.publication_date:
                    if self._normalize_date(book.publication_date) == self._normalize_date(candidate.publication_date):
                        matching_fields.append('publication_date')
                
                if book.publisher and candidate.publisher:
                    if self._calculate_string_similarity(book.publisher, candidate.publisher) >= 0.8:
                        matching_fields.append('publisher')
                
                match = DuplicateMatch(
                    book1=book,
                    book2=candidate,
                    duplicate_type=DuplicateType.FUZZY_MATCH,
                    confidence=confidence,
                    similarity_score=combined_similarity,
                    matching_fields=matching_fields,
                    differences=self._find_metadata_differences(book, candidate),
                    recommended_action=self._recommend_merge_action(book, candidate),
                    merge_priority_book_id=self._select_primary_book(book, candidate).id
                )
                
                duplicates.append(match)
                self.detection_stats['fuzzy_matches'] += 1
        
        return duplicates
    
    async def _find_content_hash_duplicates(self, book: BookRecord, all_books: List[BookRecord], 
                                          current_index: int) -> List[DuplicateMatch]:
        """Find duplicates based on content hash comparison."""
        # This would require file content hashing - placeholder implementation
        # In a real implementation, you'd hash file contents and compare
        duplicates = []
        
        # For now, we'll use a simple heuristic based on file sizes
        if book.total_file_size > 0:
            for candidate in all_books[current_index + 1:]:
                if candidate.total_file_size == book.total_file_size and \
                   candidate.total_file_size > 1024:  # Ignore very small files
                    
                    # Additional validation - check if titles are somewhat similar
                    title_similarity = self._calculate_string_similarity(
                        self._normalize_title(book.title),
                        self._normalize_title(candidate.title)
                    )
                    
                    if title_similarity >= 0.6:  # Lower threshold for content matches
                        match = DuplicateMatch(
                            book1=book,
                            book2=candidate,
                            duplicate_type=DuplicateType.CONTENT_HASH_MATCH,
                            confidence=MatchConfidence.MEDIUM,
                            similarity_score=0.8,  # Fixed score for content hash matches
                            matching_fields=['file_size'],
                            differences=self._find_metadata_differences(book, candidate),
                            recommended_action=MergeAction.MANUAL_REVIEW,
                            merge_priority_book_id=self._select_primary_book(book, candidate).id
                        )
                        
                        duplicates.append(match)
        
        return duplicates
    
    def _normalize_isbn(self, isbn: str) -> str:
        """Normalize ISBN for comparison."""
        if not isbn:
            return ""
        
        # Remove hyphens, spaces, and convert to uppercase
        normalized = re.sub(r'[-\s]', '', isbn).upper()
        return normalized
    
    def _normalize_title(self, title: str) -> str:
        """Normalize title for comparison."""
        if not title:
            return ""
        
        # Check cache first
        if title in self.normalized_title_cache:
            return self.normalized_title_cache[title]
        
        # Normalize unicode characters
        normalized = unicodedata.normalize('NFKD', title)
        
        # Convert to lowercase
        normalized = normalized.lower()
        
        # Remove common articles and prepositions from the beginning
        articles = ['the ', 'a ', 'an ', 'le ', 'la ', 'les ', 'un ', 'une ']
        for article in articles:
            if normalized.startswith(article):
                normalized = normalized[len(article):]
                break
        
        # Remove punctuation and extra spaces
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        # Remove common edition indicators
        edition_patterns = [
            r'\s*\d+(?:st|nd|rd|th)?\s*edition\s*$',
            r'\s*revised\s*edition\s*$',
            r'\s*updated\s*edition\s*$',
            r'\s*expanded\s*edition\s*$'
        ]
        
        for pattern in edition_patterns:
            normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
        
        # Cache the result
        if len(self.normalized_title_cache) < self.similarity_cache_size:
            self.normalized_title_cache[title] = normalized
        
        return normalized
    
    def _normalize_author(self, author: str) -> str:
        """Normalize author name for comparison."""
        if not author:
            return ""
        
        # Normalize unicode
        normalized = unicodedata.normalize('NFKD', author)
        
        # Convert to lowercase
        normalized = normalized.lower()
        
        # Remove punctuation except periods (for initials)
        normalized = re.sub(r'[^\w\s.]', '', normalized)
        
        # Normalize spaces
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        # Handle "Last, First" format
        if ',' in normalized:
            parts = normalized.split(',', 1)
            if len(parts) == 2:
                last_name = parts[0].strip()
                first_name = parts[1].strip()
                normalized = f"{first_name} {last_name}".strip()
        
        return normalized
    
    def _normalize_date(self, date_str: str) -> str:
        """Normalize publication date for comparison."""
        if not date_str:
            return ""
        
        # Extract year from various date formats
        date_match = re.search(r'\d{4}', date_str)
        if date_match:
            return date_match.group()
        
        return ""
    
    def _calculate_string_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity between two strings using multiple methods."""
        if not str1 or not str2:
            return 0.0
        
        if str1 == str2:
            return 1.0
        
        # Use cached result if available
        cache_key = f"{str1}::{str2}"
        if cache_key in self.similarity_cache:
            return self.similarity_cache[cache_key]
        
        # Use SequenceMatcher for similarity
        similarity = difflib.SequenceMatcher(None, str1, str2).ratio()
        
        # Also try with Levenshtein-based approach for shorter strings
        if len(str1) < 100 and len(str2) < 100:
            levenshtein_similarity = self._levenshtein_similarity(str1, str2)
            # Use the higher of the two similarities
            similarity = max(similarity, levenshtein_similarity)
        
        # Cache the result
        if len(self.similarity_cache) < self.similarity_cache_size:
            self.similarity_cache[cache_key] = similarity
        
        return similarity
    
    def _levenshtein_similarity(self, str1: str, str2: str) -> float:
        """Calculate Levenshtein-based similarity."""
        def levenshtein_distance(s1, s2):
            if len(s1) < len(s2):
                return levenshtein_distance(s2, s1)
            
            if len(s2) == 0:
                return len(s1)
            
            previous_row = list(range(len(s2) + 1))
            for i, c1 in enumerate(s1):
                current_row = [i + 1]
                for j, c2 in enumerate(s2):
                    insertions = previous_row[j + 1] + 1
                    deletions = current_row[j] + 1
                    substitutions = previous_row[j] + (c1 != c2)
                    current_row.append(min(insertions, deletions, substitutions))
                previous_row = current_row
            
            return previous_row[-1]
        
        max_len = max(len(str1), len(str2))
        if max_len == 0:
            return 1.0
        
        distance = levenshtein_distance(str1, str2)
        return 1.0 - (distance / max_len)
    
    def _calculate_author_similarity(self, authors1: List[str], authors2: List[str]) -> float:
        """Calculate similarity between author lists."""
        if not authors1 or not authors2:
            return 1.0 if not authors1 and not authors2 else 0.0
        
        # Normalize all author names
        norm_authors1 = [self._normalize_author(author) for author in authors1]
        norm_authors2 = [self._normalize_author(author) for author in authors2]
        
        # Find best matches between author lists
        max_similarity = 0.0
        
        for author1 in norm_authors1:
            for author2 in norm_authors2:
                similarity = self._calculate_string_similarity(author1, author2)
                max_similarity = max(max_similarity, similarity)
        
        return max_similarity
    
    def _calculate_overall_similarity(self, book1: BookRecord, book2: BookRecord) -> float:
        """Calculate overall similarity between two books."""
        scores = []
        weights = []
        
        # Title similarity (highest weight)
        title_sim = self._calculate_string_similarity(
            self._normalize_title(book1.title),
            self._normalize_title(book2.title)
        )
        scores.append(title_sim)
        weights.append(0.4)
        
        # Author similarity
        author_sim = self._calculate_author_similarity(book1.authors, book2.authors)
        scores.append(author_sim)
        weights.append(0.3)
        
        # ISBN similarity
        isbn_sim = 0.0
        if book1.isbn_13 and book2.isbn_13:
            isbn_sim = 1.0 if self._normalize_isbn(book1.isbn_13) == self._normalize_isbn(book2.isbn_13) else 0.0
        elif book1.isbn_10 and book2.isbn_10:
            isbn_sim = 1.0 if self._normalize_isbn(book1.isbn_10) == self._normalize_isbn(book2.isbn_10) else 0.0
        scores.append(isbn_sim)
        weights.append(0.15)
        
        # Publication date similarity
        date_sim = 0.0
        if book1.publication_date and book2.publication_date:
            date_sim = 1.0 if self._normalize_date(book1.publication_date) == self._normalize_date(book2.publication_date) else 0.0
        scores.append(date_sim)
        weights.append(0.1)
        
        # Publisher similarity
        pub_sim = 0.0
        if book1.publisher and book2.publisher:
            pub_sim = self._calculate_string_similarity(book1.publisher, book2.publisher)
        scores.append(pub_sim)
        weights.append(0.05)
        
        # Calculate weighted average
        weighted_sum = sum(score * weight for score, weight in zip(scores, weights))
        total_weight = sum(weights)
        
        return weighted_sum / total_weight if total_weight > 0 else 0.0
    
    def _has_exact_identifiers_match(self, book1: BookRecord, book2: BookRecord) -> bool:
        """Check if books have exact identifier matches (ISBN, ASIN)."""
        # ISBN matches
        if book1.isbn_13 and book2.isbn_13:
            if self._normalize_isbn(book1.isbn_13) == self._normalize_isbn(book2.isbn_13):
                return True
        
        if book1.isbn_10 and book2.isbn_10:
            if self._normalize_isbn(book1.isbn_10) == self._normalize_isbn(book2.isbn_10):
                return True
        
        # ASIN matches
        if book1.asin and book2.asin:
            if book1.asin == book2.asin:
                return True
        
        return False
    
    def _find_metadata_differences(self, book1: BookRecord, book2: BookRecord) -> Dict[str, Tuple[Any, Any]]:
        """Find differences in metadata between two books."""
        differences = {}
        
        # Compare key fields
        fields_to_compare = [
            'title', 'subtitle', 'description', 'isbn_10', 'isbn_13', 'asin',
            'publication_date', 'publisher', 'language', 'page_count',
            'rating_average', 'rating_count', 'series', 'series_position'
        ]
        
        for field in fields_to_compare:
            value1 = getattr(book1, field)
            value2 = getattr(book2, field)
            
            if value1 != value2:
                differences[field] = (value1, value2)
        
        # Compare lists
        if book1.authors != book2.authors:
            differences['authors'] = (book1.authors, book2.authors)
        
        if book1.genres != book2.genres:
            differences['genres'] = (book1.genres, book2.genres)
        
        if book1.tags != book2.tags:
            differences['tags'] = (book1.tags, book2.tags)
        
        return differences
    
    def _recommend_merge_action(self, book1: BookRecord, book2: BookRecord) -> MergeAction:
        """Recommend merge action based on book metadata quality."""
        # If one book has significantly more metadata, prefer it
        book1_completeness = self._calculate_metadata_completeness(book1)
        book2_completeness = self._calculate_metadata_completeness(book2)
        
        completeness_diff = abs(book1_completeness - book2_completeness)
        
        if completeness_diff > 0.3:
            if book1_completeness > book2_completeness:
                return MergeAction.KEEP_FIRST
            else:
                return MergeAction.KEEP_SECOND
        
        # If similar completeness, consider other factors
        
        # Prefer book with more files
        if book1.file_count != book2.file_count:
            if book1.file_count > book2.file_count:
                return MergeAction.KEEP_FIRST
            else:
                return MergeAction.KEEP_SECOND
        
        # Prefer more recent book
        if book1.updated_at != book2.updated_at:
            if book1.updated_at > book2.updated_at:
                return MergeAction.KEEP_FIRST
            else:
                return MergeAction.KEEP_SECOND
        
        # Default to merging metadata
        return MergeAction.MERGE_METADATA
    
    def _calculate_metadata_completeness(self, book: BookRecord) -> float:
        """Calculate completeness score for book metadata."""
        total_fields = 0
        completed_fields = 0
        
        # Check important fields
        fields_to_check = {
            'title': 1.0,
            'authors': 0.8,
            'description': 0.6,
            'isbn_13': 0.7,
            'publication_date': 0.5,
            'publisher': 0.4,
            'page_count': 0.3,
            'rating_average': 0.2,
            'genres': 0.4
        }
        
        for field, weight in fields_to_check.items():
            total_fields += weight
            
            if field == 'authors':
                if book.authors and len(book.authors) > 0:
                    completed_fields += weight
            elif field == 'genres':
                if book.genres and len(book.genres) > 0:
                    completed_fields += weight
            else:
                value = getattr(book, field)
                if value is not None and str(value).strip():
                    completed_fields += weight
        
        return completed_fields / total_fields if total_fields > 0 else 0.0
    
    def _select_primary_book(self, book1: BookRecord, book2: BookRecord) -> BookRecord:
        """Select which book should be the primary in a merge."""
        book1_score = self._calculate_primary_book_score(book1)
        book2_score = self._calculate_primary_book_score(book2)
        
        return book1 if book1_score >= book2_score else book2
    
    def _calculate_primary_book_score(self, book: BookRecord) -> float:
        """Calculate score for selecting primary book in merge."""
        score = 0.0
        
        # Metadata completeness (40% of score)
        completeness = self._calculate_metadata_completeness(book)
        score += completeness * 0.4
        
        # File count (20% of score)
        file_score = min(book.file_count / 10.0, 1.0)  # Normalize to max 10 files
        score += file_score * 0.2
        
        # Rating quality (15% of score)
        if book.rating_average and book.rating_count:
            # Prefer books with more ratings and higher averages
            rating_score = (book.rating_average / 5.0) * min(book.rating_count / 100.0, 1.0)
            score += rating_score * 0.15
        
        # Recency (15% of score)
        # Books updated more recently get higher scores
        days_old = (datetime.now() - book.updated_at).days
        recency_score = max(0.0, 1.0 - (days_old / 365.0))  # Decay over a year
        score += recency_score * 0.15
        
        # Data source quality (10% of score)
        # Prefer books with ISBN-13, publisher, etc.
        quality_indicators = [
            book.isbn_13 is not None,
            book.publisher is not None,
            book.publication_date is not None,
            len(book.authors) > 0,
            len(book.genres) > 0
        ]
        quality_score = sum(quality_indicators) / len(quality_indicators)
        score += quality_score * 0.1
        
        return score
    
    def _deduplicate_matches(self, matches: List[DuplicateMatch]) -> List[DuplicateMatch]:
        """Remove duplicate matches from the matches list."""
        seen_pairs = set()
        unique_matches = []
        
        for match in matches:
            # Create a canonical pair representation
            pair = tuple(sorted([match.book1.id, match.book2.id]))
            
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                unique_matches.append(match)
        
        return unique_matches
    
    def group_duplicates(self, matches: List[DuplicateMatch]) -> List[DuplicateGroup]:
        """Group duplicate matches into connected components."""
        # Build graph of connections
        graph = defaultdict(set)
        book_lookup = {}
        
        for match in matches:
            graph[match.book1.id].add(match.book2.id)
            graph[match.book2.id].add(match.book1.id)
            book_lookup[match.book1.id] = match.book1
            book_lookup[match.book2.id] = match.book2
        
        # Find connected components
        visited = set()
        groups = []
        
        for book_id in graph:
            if book_id not in visited:
                # BFS to find connected component
                component = set()
                queue = [book_id]
                
                while queue:
                    current = queue.pop(0)
                    if current not in visited:
                        visited.add(current)
                        component.add(current)
                        queue.extend(graph[current] - visited)
                
                if len(component) > 1:
                    # Create duplicate group
                    books_in_group = [book_lookup[book_id] for book_id in component]
                    
                    # Select primary book
                    primary_book = max(books_in_group, key=self._calculate_primary_book_score)
                    
                    # Get matches for this group
                    group_matches = [
                        match for match in matches
                        if match.book1.id in component and match.book2.id in component
                    ]
                    
                    highest_confidence = max(match.confidence for match in group_matches)
                    
                    group = DuplicateGroup(
                        group_id=f"group_{min(component)}",
                        primary_book=primary_book,
                        duplicate_books=[book for book in books_in_group if book.id != primary_book.id],
                        total_matches=len(group_matches),
                        highest_confidence=highest_confidence,
                        recommended_primary=primary_book,
                        merge_suggestions=self._generate_merge_suggestions(books_in_group, group_matches)
                    )
                    
                    groups.append(group)
        
        return groups
    
    def _generate_merge_suggestions(self, books: List[BookRecord], 
                                  matches: List[DuplicateMatch]) -> List[Dict]:
        """Generate merge suggestions for a group of duplicate books."""
        suggestions = []
        
        # Sort books by primary score
        books_sorted = sorted(books, key=self._calculate_primary_book_score, reverse=True)
        primary_book = books_sorted[0]
        
        # Suggest merging all into primary
        suggestion = {
            'action': 'merge_all_to_primary',
            'primary_book_id': primary_book.id,
            'books_to_merge': [book.id for book in books_sorted[1:]],
            'estimated_space_saved': sum(book.total_file_size for book in books_sorted[1:]),
            'metadata_conflicts': []
        }
        
        # Identify metadata conflicts that need resolution
        for other_book in books_sorted[1:]:
            differences = self._find_metadata_differences(primary_book, other_book)
            if differences:
                suggestion['metadata_conflicts'].append({
                    'book_id': other_book.id,
                    'conflicts': differences
                })
        
        suggestions.append(suggestion)
        
        return suggestions
    
    async def auto_merge_duplicates(self, matches: List[DuplicateMatch]) -> Dict:
        """Automatically merge high-confidence duplicates."""
        if not self.auto_merge_exact_matches and not self.auto_merge_high_confidence:
            return {'auto_merged': 0, 'skipped': len(matches), 'errors': []}
        
        auto_merged = 0
        errors = []
        skipped = 0
        
        for match in matches:
            should_auto_merge = False
            
            # Check if should auto-merge exact matches
            if self.auto_merge_exact_matches and match.duplicate_type in [
                DuplicateType.EXACT_MATCH, DuplicateType.ISBN_MATCH
            ]:
                should_auto_merge = True
            
            # Check if should auto-merge high confidence
            elif self.auto_merge_high_confidence and \
                 match.confidence == MatchConfidence.HIGH and \
                 match.similarity_score >= 0.95:
                should_auto_merge = True
            
            if should_auto_merge:
                try:
                    await self._perform_merge(match)
                    auto_merged += 1
                    self.detection_stats['auto_merged'] += 1
                    logger.info(f"Auto-merged books {match.book1.id} and {match.book2.id}")
                except Exception as e:
                    error_msg = f"Failed to auto-merge books {match.book1.id} and {match.book2.id}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
            else:
                skipped += 1
                if match.similarity_score < self.require_manual_review_threshold:
                    self.detection_stats['manual_review_required'] += 1
        
        return {
            'auto_merged': auto_merged,
            'skipped': skipped,
            'errors': errors
        }
    
    async def _perform_merge(self, match: DuplicateMatch):
        """Perform the actual merge of two duplicate books."""
        primary_book = self._select_primary_book(match.book1, match.book2)
        secondary_book = match.book2 if primary_book == match.book1 else match.book1
        
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Start transaction
                conn.execute("BEGIN TRANSACTION")
                
                # Merge book files
                cursor.execute("""
                    UPDATE book_files 
                    SET book_id = ? 
                    WHERE book_id = ?
                """, (primary_book.id, secondary_book.id))
                
                # Merge download history
                cursor.execute("""
                    UPDATE download_history 
                    SET book_id = ? 
                    WHERE book_id = ?
                """, (primary_book.id, secondary_book.id))
                
                # Merge download queue entries
                cursor.execute("""
                    UPDATE download_queue 
                    SET book_id = ? 
                    WHERE book_id = ?
                """, (primary_book.id, secondary_book.id))
                
                # Merge metadata if recommended
                if match.recommended_action == MergeAction.MERGE_METADATA:
                    await self._merge_book_metadata(cursor, primary_book, secondary_book)
                
                # Delete secondary book and its relationships
                cursor.execute("DELETE FROM book_authors WHERE book_id = ?", (secondary_book.id,))
                cursor.execute("DELETE FROM book_genres WHERE book_id = ?", (secondary_book.id,))
                cursor.execute("DELETE FROM books WHERE id = ?", (secondary_book.id,))
                
                # Log the merge
                cursor.execute("""
                    INSERT INTO system_logs 
                    (level, component, message, details, created_at)
                    VALUES ('INFO', 'duplicate_detector', ?, ?, ?)
                """, (
                    f"Merged duplicate books",
                    json.dumps({
                        'primary_book_id': primary_book.id,
                        'merged_book_id': secondary_book.id,
                        'duplicate_type': match.duplicate_type.value,
                        'confidence': match.confidence.value,
                        'similarity_score': match.similarity_score
                    }),
                    datetime.now().isoformat()
                ))
                
                # Commit transaction
                conn.commit()
                
                logger.info(f"Successfully merged book {secondary_book.id} into {primary_book.id}")
                
        except Exception as e:
            # Rollback on error
            conn.rollback()
            raise e
    
    async def _merge_book_metadata(self, cursor: sqlite3.Cursor, 
                                  primary_book: BookRecord, secondary_book: BookRecord):
        """Merge metadata from secondary book into primary book."""
        updates = {}
        
        # Merge fields where primary is missing data
        if not primary_book.subtitle and secondary_book.subtitle:
            updates['subtitle'] = secondary_book.subtitle
        
        if not primary_book.description and secondary_book.description:
            updates['description'] = secondary_book.description
        elif secondary_book.description and len(secondary_book.description) > len(primary_book.description or ''):
            updates['description'] = secondary_book.description
        
        if not primary_book.isbn_10 and secondary_book.isbn_10:
            updates['isbn_10'] = secondary_book.isbn_10
        
        if not primary_book.isbn_13 and secondary_book.isbn_13:
            updates['isbn_13'] = secondary_book.isbn_13
        
        if not primary_book.asin and secondary_book.asin:
            updates['asin'] = secondary_book.asin
        
        if not primary_book.publication_date and secondary_book.publication_date:
            updates['publication_date'] = secondary_book.publication_date
        
        if not primary_book.publisher and secondary_book.publisher:
            updates['publisher_id'] = f"(SELECT id FROM publishers WHERE name = '{secondary_book.publisher}')"
        
        if not primary_book.page_count and secondary_book.page_count:
            updates['page_count'] = secondary_book.page_count
        
        # Merge ratings (take higher rating count)
        if secondary_book.rating_count and (
            not primary_book.rating_count or 
            secondary_book.rating_count > primary_book.rating_count
        ):
            updates['rating_average'] = secondary_book.rating_average
            updates['rating_count'] = secondary_book.rating_count
        
        # Apply updates
        if updates:
            set_clause = ', '.join([f"{field} = ?" for field in updates.keys()])
            values = list(updates.values())
            values.append(primary_book.id)
            
            cursor.execute(f"""
                UPDATE books 
                SET {set_clause}, updated_at = ?
                WHERE id = ?
            """, values + [datetime.now().isoformat()])
    
    def generate_duplicate_report(self) -> Dict:
        """Generate comprehensive duplicate detection report."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Total book count
                cursor.execute("SELECT COUNT(*) FROM books")
                total_books = cursor.fetchone()[0]
                
                # Books with multiple files (potential duplicates)
                cursor.execute("""
                    SELECT COUNT(*) FROM (
                        SELECT book_id, COUNT(*) as file_count
                        FROM book_files
                        GROUP BY book_id
                        HAVING file_count > 1
                    )
                """)
                books_with_multiple_files = cursor.fetchone()[0]
                
                # Books with missing ISBNs (harder to deduplicate)
                cursor.execute("""
                    SELECT COUNT(*) FROM books 
                    WHERE (isbn_10 IS NULL OR isbn_10 = '') 
                    AND (isbn_13 IS NULL OR isbn_13 = '')
                """)
                books_without_isbn = cursor.fetchone()[0]
                
                return {
                    'timestamp': datetime.now().isoformat(),
                    'summary': {
                        'total_books': total_books,
                        'books_with_multiple_files': books_with_multiple_files,
                        'books_without_isbn': books_without_isbn,
                        'estimated_duplicate_risk': round(
                            (books_without_isbn / total_books * 100) if total_books > 0 else 0, 2
                        )
                    },
                    'detection_statistics': self.detection_stats,
                    'configuration': {
                        'fuzzy_threshold': self.fuzzy_threshold,
                        'title_similarity_threshold': self.title_similarity_threshold,
                        'author_similarity_threshold': self.author_similarity_threshold,
                        'auto_merge_exact_matches': self.auto_merge_exact_matches,
                        'auto_merge_high_confidence': self.auto_merge_high_confidence
                    }
                }
                
        except Exception as e:
            logger.error(f"Error generating duplicate report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}


def main():
    parser = argparse.ArgumentParser(description='FolioFox Duplicate Book Detector')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['detect', 'report', 'auto-merge'], default='detect',
                       help='Operation mode')
    parser.add_argument('--limit', type=int, help='Limit number of books to process')
    parser.add_argument('--output', help='Output file for duplicate matches')
    
    args = parser.parse_args()
    
    detector = DuplicateDetector(args.config)
    
    if args.mode == 'detect':
        # Detect duplicates
        async def run_detection():
            books = detector.get_books_for_duplicate_detection(args.limit)
            matches = await detector.detect_duplicates(books)
            
            # Group duplicates
            groups = detector.group_duplicates(matches)
            
            result = {
                'matches': [asdict(match) for match in matches],
                'groups': [asdict(group) for group in groups],
                'statistics': detector.detection_stats
            }
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(result, f, indent=2, default=str)
                print(f"Results saved to {args.output}")
            else:
                print(json.dumps(result, indent=2, default=str))
        
        asyncio.run(run_detection())
        
    elif args.mode == 'auto-merge':
        # Auto-merge high confidence duplicates
        async def run_auto_merge():
            books = detector.get_books_for_duplicate_detection(args.limit)
            matches = await detector.detect_duplicates(books)
            result = await detector.auto_merge_duplicates(matches)
            print(json.dumps(result, indent=2, default=str))
        
        asyncio.run(run_auto_merge())
        
    else:
        # Generate and print report
        report = detector.generate_duplicate_report()
        print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()