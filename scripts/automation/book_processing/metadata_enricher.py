#!/usr/bin/env python3
"""
FolioFox Book Metadata Enricher
Automated metadata enrichment from multiple sources with deduplication and validation.
"""

import argparse
import asyncio
import json
import logging
import sqlite3
import sys
import time
import re
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import yaml
from PIL import Image
import requests
from urllib.parse import quote, urljoin
import xml.etree.ElementTree as ET

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/foliofox/metadata_enricher.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('foliofox.metadata_enricher')

class MetadataSource(Enum):
    GOOGLE_BOOKS = "google_books"
    GOODREADS = "goodreads"
    OPENLIBRARY = "openlibrary"
    WORLDCAT = "worldcat"
    AMAZON = "amazon"
    LOCAL_FILE = "local_file"

class BookFormat(Enum):
    EPUB = "epub"
    PDF = "pdf"
    MOBI = "mobi"
    AZW3 = "azw3"
    TXT = "txt"
    FB2 = "fb2"
    DJVU = "djvu"

@dataclass
class BookMetadata:
    title: str
    subtitle: Optional[str] = None
    authors: List[str] = None
    description: Optional[str] = None
    isbn_10: Optional[str] = None
    isbn_13: Optional[str] = None
    asin: Optional[str] = None
    google_books_id: Optional[str] = None
    goodreads_id: Optional[str] = None
    publication_date: Optional[str] = None
    publisher: Optional[str] = None
    language: Optional[str] = None
    page_count: Optional[int] = None
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    genres: List[str] = None
    series: Optional[str] = None
    series_position: Optional[float] = None
    cover_url: Optional[str] = None
    tags: List[str] = None
    confidence_score: float = 0.0
    source: MetadataSource = None

@dataclass
class EnrichmentResult:
    book_id: int
    original_metadata: BookMetadata
    enriched_metadata: BookMetadata
    sources_used: List[MetadataSource]
    confidence_score: float
    processing_time_seconds: float
    errors: List[str]
    success: bool

class MetadataEnricher:
    """Comprehensive metadata enrichment system."""
    
    def __init__(self, config_path: str = "./config/config.yaml"):
        self.config = self._load_config(config_path)
        self.db_path = self.config.get('database', {}).get('path', './data/foliofox.db')
        
        # API configurations
        self.google_books_api_key = self.config.get('api_keys', {}).get('google_books')
        self.goodreads_api_key = self.config.get('api_keys', {}).get('goodreads')
        
        # Processing configuration
        self.max_concurrent_requests = self.config.get('metadata', {}).get('max_concurrent_requests', 5)
        self.request_delay = self.config.get('metadata', {}).get('request_delay_seconds', 1)
        self.timeout_seconds = self.config.get('metadata', {}).get('timeout_seconds', 30)
        self.enable_cover_download = self.config.get('metadata', {}).get('enable_cover_download', True)
        self.cover_storage_path = Path(self.config.get('metadata', {}).get('cover_storage_path', './covers'))
        
        # Confidence thresholds
        self.min_confidence_threshold = self.config.get('metadata', {}).get('min_confidence_threshold', 0.7)
        self.high_confidence_threshold = self.config.get('metadata', {}).get('high_confidence_threshold', 0.9)
        
        # Rate limiting
        self.request_times: Dict[MetadataSource, List[datetime]] = {}
        
        # Statistics
        self.processing_stats = {
            'total_processed': 0,
            'successful_enrichments': 0,
            'failed_enrichments': 0,
            'metadata_sources_used': {},
            'avg_confidence_score': 0.0
        }
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration with metadata-specific defaults."""
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
        """Return default metadata enrichment configuration."""
        return {
            'database': {'path': './data/foliofox.db'},
            'metadata': {
                'max_concurrent_requests': 5,
                'request_delay_seconds': 1,
                'timeout_seconds': 30,
                'enable_cover_download': True,
                'cover_storage_path': './covers',
                'min_confidence_threshold': 0.7,
                'high_confidence_threshold': 0.9,
                'enable_duplicate_detection': True,
                'auto_merge_duplicates': False
            },
            'api_keys': {
                'google_books': None,
                'goodreads': None
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
    
    def get_books_needing_enrichment(self, limit: int = 100) -> List[Dict]:
        """Get books that need metadata enrichment."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Find books with missing or incomplete metadata
                cursor.execute("""
                    SELECT b.id, b.title, b.subtitle, b.isbn_10, b.isbn_13, 
                           b.asin, b.description, b.publication_date, b.page_count,
                           b.rating_average, b.rating_count, b.cover_url,
                           GROUP_CONCAT(a.name, '; ') as authors,
                           s.name as series_name, b.series_position,
                           l.code as language_code, p.name as publisher_name
                    FROM books b
                    LEFT JOIN book_authors ba ON b.id = ba.book_id
                    LEFT JOIN authors a ON ba.author_id = a.id
                    LEFT JOIN series s ON b.series_id = s.id
                    LEFT JOIN languages l ON b.language_id = l.id
                    LEFT JOIN publishers p ON b.publisher_id = p.id
                    WHERE (
                        b.description IS NULL OR b.description = '' OR
                        b.publication_date IS NULL OR
                        b.page_count IS NULL OR
                        b.rating_average IS NULL OR
                        b.cover_url IS NULL OR b.cover_url = '' OR
                        NOT EXISTS (SELECT 1 FROM book_authors WHERE book_id = b.id)
                    )
                    AND b.updated_at < datetime('now', '-1 day')  -- Don't re-enrich recently updated
                    GROUP BY b.id
                    ORDER BY b.created_at DESC
                    LIMIT ?
                """, (limit,))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error getting books needing enrichment: {e}")
            return []
    
    async def enrich_book_metadata(self, book_data: Dict) -> EnrichmentResult:
        """Enrich metadata for a single book."""
        start_time = time.time()
        book_id = book_data['id']
        
        logger.info(f"Starting enrichment for book ID {book_id}: {book_data['title']}")
        
        # Create original metadata object
        original_metadata = self._dict_to_metadata(book_data)
        
        # Initialize result
        result = EnrichmentResult(
            book_id=book_id,
            original_metadata=original_metadata,
            enriched_metadata=original_metadata,
            sources_used=[],
            confidence_score=0.0,
            processing_time_seconds=0.0,
            errors=[],
            success=False
        )
        
        try:
            # Determine search strategies based on available identifiers
            search_strategies = self._plan_search_strategies(original_metadata)
            
            # Collect metadata from multiple sources
            metadata_candidates = []
            
            for strategy in search_strategies:
                try:
                    metadata = await self._fetch_metadata_from_source(strategy, original_metadata)
                    if metadata:
                        metadata_candidates.append(metadata)
                        result.sources_used.append(strategy['source'])
                        
                        # Add small delay between requests
                        await asyncio.sleep(self.request_delay)
                        
                except Exception as e:
                    error_msg = f"Error fetching from {strategy['source'].value}: {str(e)}"
                    logger.warning(error_msg)
                    result.errors.append(error_msg)
            
            # Merge and validate metadata
            if metadata_candidates:
                merged_metadata = self._merge_metadata_candidates(original_metadata, metadata_candidates)
                
                # Validate and score the merged metadata
                validation_result = self._validate_metadata(merged_metadata)
                merged_metadata.confidence_score = validation_result['confidence_score']
                
                # Only update if confidence is above threshold
                if merged_metadata.confidence_score >= self.min_confidence_threshold:
                    result.enriched_metadata = merged_metadata
                    result.confidence_score = merged_metadata.confidence_score
                    result.success = True
                    
                    # Download cover if enabled and URL is available
                    if self.enable_cover_download and merged_metadata.cover_url:
                        try:
                            local_cover_path = await self._download_cover_image(
                                book_id, merged_metadata.cover_url
                            )
                            if local_cover_path:
                                result.enriched_metadata.cover_url = str(local_cover_path)
                        except Exception as e:
                            result.errors.append(f"Cover download failed: {str(e)}")
                    
                    # Store enriched metadata
                    await self._store_enriched_metadata(book_id, result.enriched_metadata)
                    
                    logger.info(f"Successfully enriched book ID {book_id} "
                               f"(confidence: {merged_metadata.confidence_score:.2f})")
                else:
                    result.errors.append(f"Confidence score {merged_metadata.confidence_score:.2f} "
                                        f"below threshold {self.min_confidence_threshold}")
                    logger.warning(f"Low confidence enrichment for book ID {book_id}")
            else:
                result.errors.append("No metadata found from any source")
                logger.warning(f"No metadata sources returned data for book ID {book_id}")
                
        except Exception as e:
            error_msg = f"Unexpected error during enrichment: {str(e)}"
            logger.error(error_msg)
            result.errors.append(error_msg)
        
        result.processing_time_seconds = time.time() - start_time
        return result
    
    def _dict_to_metadata(self, book_data: Dict) -> BookMetadata:
        """Convert database row dict to BookMetadata object."""
        return BookMetadata(
            title=book_data['title'],
            subtitle=book_data.get('subtitle'),
            authors=book_data.get('authors', '').split('; ') if book_data.get('authors') else [],
            description=book_data.get('description'),
            isbn_10=book_data.get('isbn_10'),
            isbn_13=book_data.get('isbn_13'),
            asin=book_data.get('asin'),
            publication_date=book_data.get('publication_date'),
            publisher=book_data.get('publisher_name'),
            language=book_data.get('language_code'),
            page_count=book_data.get('page_count'),
            rating=book_data.get('rating_average'),
            rating_count=book_data.get('rating_count'),
            series=book_data.get('series_name'),
            series_position=book_data.get('series_position'),
            cover_url=book_data.get('cover_url')
        )
    
    def _plan_search_strategies(self, metadata: BookMetadata) -> List[Dict]:
        """Plan search strategies based on available identifiers."""
        strategies = []
        
        # ISBN-based searches (highest priority)
        if metadata.isbn_13:
            strategies.append({
                'source': MetadataSource.GOOGLE_BOOKS,
                'query_type': 'isbn',
                'query_value': metadata.isbn_13
            })
            strategies.append({
                'source': MetadataSource.OPENLIBRARY,
                'query_type': 'isbn',
                'query_value': metadata.isbn_13
            })
        
        if metadata.isbn_10:
            strategies.append({
                'source': MetadataSource.GOOGLE_BOOKS,
                'query_type': 'isbn',
                'query_value': metadata.isbn_10
            })
        
        # ASIN-based search
        if metadata.asin:
            strategies.append({
                'source': MetadataSource.AMAZON,
                'query_type': 'asin',
                'query_value': metadata.asin
            })
        
        # Title + Author search
        if metadata.title and metadata.authors:
            for source in [MetadataSource.GOOGLE_BOOKS, MetadataSource.OPENLIBRARY]:
                strategies.append({
                    'source': source,
                    'query_type': 'title_author',
                    'query_value': {
                        'title': metadata.title,
                        'author': metadata.authors[0] if metadata.authors else None
                    }
                })
        
        # Title-only search (lowest priority)
        elif metadata.title:
            strategies.append({
                'source': MetadataSource.GOOGLE_BOOKS,
                'query_type': 'title',
                'query_value': metadata.title
            })
        
        return strategies
    
    async def _fetch_metadata_from_source(self, strategy: Dict, original_metadata: BookMetadata) -> Optional[BookMetadata]:
        """Fetch metadata from a specific source."""
        source = strategy['source']
        
        # Rate limiting
        await self._enforce_rate_limit(source)
        
        if source == MetadataSource.GOOGLE_BOOKS:
            return await self._fetch_from_google_books(strategy, original_metadata)
        elif source == MetadataSource.OPENLIBRARY:
            return await self._fetch_from_openlibrary(strategy, original_metadata)
        elif source == MetadataSource.AMAZON:
            return await self._fetch_from_amazon(strategy, original_metadata)
        else:
            logger.warning(f"Unsupported metadata source: {source}")
            return None
    
    async def _enforce_rate_limit(self, source: MetadataSource):
        """Enforce rate limiting for API requests."""
        now = datetime.now()
        
        if source not in self.request_times:
            self.request_times[source] = []
        
        # Remove old requests (older than 1 minute)
        self.request_times[source] = [
            req_time for req_time in self.request_times[source]
            if (now - req_time).total_seconds() < 60
        ]
        
        # Check rate limits (adjust per source)
        rate_limits = {
            MetadataSource.GOOGLE_BOOKS: 10,  # 10 requests per minute
            MetadataSource.OPENLIBRARY: 100,  # 100 requests per minute
            MetadataSource.AMAZON: 1,  # 1 request per minute (be conservative)
        }
        
        limit = rate_limits.get(source, 10)
        
        if len(self.request_times[source]) >= limit:
            sleep_time = 60 - (now - self.request_times[source][0]).total_seconds()
            if sleep_time > 0:
                logger.info(f"Rate limiting {source.value}: sleeping {sleep_time:.1f}s")
                await asyncio.sleep(sleep_time)
        
        self.request_times[source].append(now)
    
    async def _fetch_from_google_books(self, strategy: Dict, original_metadata: BookMetadata) -> Optional[BookMetadata]:
        """Fetch metadata from Google Books API."""
        try:
            query_type = strategy['query_type']
            query_value = strategy['query_value']
            
            # Build query
            if query_type == 'isbn':
                query = f"isbn:{query_value}"
            elif query_type == 'title_author':
                title = query_value['title']
                author = query_value.get('author', '')
                query = f"intitle:{title}"
                if author:
                    query += f"+inauthor:{author}"
            elif query_type == 'title':
                query = f"intitle:{query_value}"
            else:
                return None
            
            # Make API request
            base_url = "https://www.googleapis.com/books/v1/volumes"
            params = {
                'q': query,
                'maxResults': 5,
                'printType': 'books',
                'projection': 'full'
            }
            
            if self.google_books_api_key:
                params['key'] = self.google_books_api_key
            
            timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(base_url, params=params) as response:
                    if response.status != 200:
                        logger.warning(f"Google Books API returned status {response.status}")
                        return None
                    
                    data = await response.json()
                    
                    if not data.get('items'):
                        return None
                    
                    # Process the best match
                    best_match = self._find_best_google_books_match(data['items'], original_metadata)
                    if best_match:
                        return self._parse_google_books_item(best_match)
                    
        except Exception as e:
            logger.error(f"Error fetching from Google Books: {e}")
            return None
    
    def _find_best_google_books_match(self, items: List[Dict], original_metadata: BookMetadata) -> Optional[Dict]:
        """Find the best matching Google Books item."""
        scored_items = []
        
        for item in items:
            volume_info = item.get('volumeInfo', {})
            score = self._calculate_match_score(volume_info, original_metadata)
            scored_items.append((score, item))
        
        if scored_items:
            # Sort by score (highest first) and return best match
            scored_items.sort(key=lambda x: x[0], reverse=True)
            best_score, best_item = scored_items[0]
            
            if best_score > 0.5:  # Minimum match threshold
                return best_item
        
        return None
    
    def _calculate_match_score(self, volume_info: Dict, original_metadata: BookMetadata) -> float:
        """Calculate match score between API result and original metadata."""
        score = 0.0
        total_weight = 0.0
        
        # Title matching (weight: 0.4)
        api_title = volume_info.get('title', '').lower()
        original_title = original_metadata.title.lower() if original_metadata.title else ''
        
        if api_title and original_title:
            title_similarity = self._calculate_string_similarity(api_title, original_title)
            score += title_similarity * 0.4
            total_weight += 0.4
        
        # Author matching (weight: 0.3)
        api_authors = volume_info.get('authors', [])
        original_authors = original_metadata.authors or []
        
        if api_authors and original_authors:
            author_score = 0.0
            for orig_author in original_authors:
                for api_author in api_authors:
                    author_similarity = self._calculate_string_similarity(
                        orig_author.lower(), api_author.lower()
                    )
                    author_score = max(author_score, author_similarity)
            
            score += author_score * 0.3
            total_weight += 0.3
        
        # ISBN matching (weight: 0.2)
        api_isbns = []
        for identifier in volume_info.get('industryIdentifiers', []):
            api_isbns.append(identifier.get('identifier', ''))
        
        original_isbns = [original_metadata.isbn_10, original_metadata.isbn_13]
        original_isbns = [isbn for isbn in original_isbns if isbn]
        
        if api_isbns and original_isbns:
            isbn_match = any(isbn in api_isbns for isbn in original_isbns)
            if isbn_match:
                score += 1.0 * 0.2
            total_weight += 0.2
        
        # Publication date matching (weight: 0.1)
        api_date = volume_info.get('publishedDate', '')
        original_date = original_metadata.publication_date or ''
        
        if api_date and original_date:
            # Extract year for comparison
            api_year = re.search(r'\d{4}', api_date)
            original_year = re.search(r'\d{4}', original_date)
            
            if api_year and original_year:
                if api_year.group() == original_year.group():
                    score += 1.0 * 0.1
            total_weight += 0.1
        
        return score / total_weight if total_weight > 0 else 0.0
    
    def _calculate_string_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity between two strings using Levenshtein distance."""
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
    
    def _parse_google_books_item(self, item: Dict) -> BookMetadata:
        """Parse Google Books API item into BookMetadata."""
        volume_info = item.get('volumeInfo', {})
        
        # Extract ISBNs
        isbn_10 = None
        isbn_13 = None
        for identifier in volume_info.get('industryIdentifiers', []):
            id_type = identifier.get('type')
            id_value = identifier.get('identifier')
            if id_type == 'ISBN_10':
                isbn_10 = id_value
            elif id_type == 'ISBN_13':
                isbn_13 = id_value
        
        # Extract cover URL
        cover_url = None
        image_links = volume_info.get('imageLinks', {})
        for size in ['large', 'medium', 'small', 'thumbnail']:
            if size in image_links:
                cover_url = image_links[size]
                break
        
        # Extract publication date
        pub_date = volume_info.get('publishedDate')
        if pub_date and len(pub_date) == 4:  # Just year
            pub_date = f"{pub_date}-01-01"
        
        return BookMetadata(
            title=volume_info.get('title'),
            subtitle=volume_info.get('subtitle'),
            authors=volume_info.get('authors', []),
            description=volume_info.get('description'),
            isbn_10=isbn_10,
            isbn_13=isbn_13,
            google_books_id=item.get('id'),
            publication_date=pub_date,
            publisher=volume_info.get('publisher'),
            language=volume_info.get('language'),
            page_count=volume_info.get('pageCount'),
            rating=volume_info.get('averageRating'),
            rating_count=volume_info.get('ratingsCount'),
            genres=volume_info.get('categories', []),
            cover_url=cover_url,
            source=MetadataSource.GOOGLE_BOOKS
        )
    
    async def _fetch_from_openlibrary(self, strategy: Dict, original_metadata: BookMetadata) -> Optional[BookMetadata]:
        """Fetch metadata from Open Library API."""
        try:
            query_type = strategy['query_type']
            query_value = strategy['query_value']
            
            # Build API URL
            if query_type == 'isbn':
                url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{query_value}&format=json&jscmd=data"
            elif query_type == 'title_author':
                # Use search API for title/author queries
                title = query_value['title']
                author = query_value.get('author', '')
                
                params = {'title': title, 'limit': 5}
                if author:
                    params['author'] = author
                
                search_url = "https://openlibrary.org/search.json"
                timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
                
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(search_url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            docs = data.get('docs', [])
                            if docs:
                                return self._parse_openlibrary_search_result(docs[0])
                return None
            else:
                return None
            
            # For ISBN queries
            timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        return None
                    
                    data = await response.json()
                    
                    # Extract book data
                    for key, book_data in data.items():
                        if book_data:
                            return self._parse_openlibrary_book_data(book_data)
                    
        except Exception as e:
            logger.error(f"Error fetching from Open Library: {e}")
            return None
    
    def _parse_openlibrary_search_result(self, doc: Dict) -> BookMetadata:
        """Parse Open Library search result."""
        # Extract publication year
        pub_year = None
        if 'first_publish_year' in doc:
            pub_year = f"{doc['first_publish_year']}-01-01"
        
        return BookMetadata(
            title=doc.get('title'),
            authors=doc.get('author_name', []),
            isbn_10=doc.get('isbn', [None])[0] if doc.get('isbn') else None,
            isbn_13=None,  # Search results don't always include ISBN-13
            publication_date=pub_year,
            publisher=doc.get('publisher', [None])[0] if doc.get('publisher') else None,
            language=doc.get('language', [None])[0] if doc.get('language') else None,
            page_count=doc.get('number_of_pages_median'),
            genres=doc.get('subject', [])[:5],  # Limit to first 5 subjects
            source=MetadataSource.OPENLIBRARY
        )
    
    def _parse_openlibrary_book_data(self, book_data: Dict) -> BookMetadata:
        """Parse Open Library book data from ISBN lookup."""
        # Extract authors
        authors = []
        for author in book_data.get('authors', []):
            authors.append(author.get('name', ''))
        
        # Extract publication date
        pub_date = book_data.get('publish_date')
        
        # Extract identifiers
        identifiers = book_data.get('identifiers', {})
        isbn_10 = identifiers.get('isbn_10', [None])[0]
        isbn_13 = identifiers.get('isbn_13', [None])[0]
        
        return BookMetadata(
            title=book_data.get('title'),
            subtitle=book_data.get('subtitle'),
            authors=authors,
            description=book_data.get('description'),
            isbn_10=isbn_10,
            isbn_13=isbn_13,
            publication_date=pub_date,
            publisher=book_data.get('publishers', [None])[0],
            page_count=book_data.get('number_of_pages'),
            cover_url=book_data.get('cover', {}).get('large'),
            source=MetadataSource.OPENLIBRARY
        )
    
    async def _fetch_from_amazon(self, strategy: Dict, original_metadata: BookMetadata) -> Optional[BookMetadata]:
        """Fetch metadata from Amazon (placeholder - would need proper API access)."""
        # This would require Amazon Product Advertising API
        # For now, return None as it requires special access
        logger.info("Amazon metadata fetching not implemented (requires API access)")
        return None
    
    def _merge_metadata_candidates(self, original: BookMetadata, candidates: List[BookMetadata]) -> BookMetadata:
        """Merge metadata from multiple sources intelligently."""
        merged = BookMetadata(title=original.title)
        
        # Start with original metadata
        for field_name in merged.__dataclass_fields__.keys():
            if hasattr(original, field_name):
                setattr(merged, field_name, getattr(original, field_name))
        
        # Merge data from candidates, prioritizing based on source reliability and completeness
        source_priority = {
            MetadataSource.GOOGLE_BOOKS: 0.9,
            MetadataSource.OPENLIBRARY: 0.8,
            MetadataSource.GOODREADS: 0.85,
            MetadataSource.AMAZON: 0.7,
            MetadataSource.LOCAL_FILE: 1.0
        }
        
        # Sort candidates by source priority
        candidates.sort(key=lambda x: source_priority.get(x.source, 0.5), reverse=True)
        
        for candidate in candidates:
            # Merge each field if it's missing or less complete
            for field_name in merged.__dataclass_fields__.keys():
                if field_name in ['confidence_score', 'source']:
                    continue
                
                original_value = getattr(merged, field_name)
                candidate_value = getattr(candidate, field_name)
                
                # Skip if candidate doesn't have this field
                if candidate_value is None:
                    continue
                
                # Always prefer non-empty values over empty ones
                if not original_value and candidate_value:
                    setattr(merged, field_name, candidate_value)
                
                # For lists, merge unique values
                elif isinstance(candidate_value, list) and isinstance(original_value, list):
                    merged_list = list(original_value)
                    for item in candidate_value:
                        if item not in merged_list:
                            merged_list.append(item)
                    setattr(merged, field_name, merged_list)
                
                # For strings, prefer longer descriptions
                elif field_name == 'description' and isinstance(candidate_value, str):
                    if not original_value or len(candidate_value) > len(original_value):
                        setattr(merged, field_name, candidate_value)
                
                # For cover URLs, prefer higher resolution (simple heuristic)
                elif field_name == 'cover_url' and isinstance(candidate_value, str):
                    if not original_value or 'large' in candidate_value.lower():
                        setattr(merged, field_name, candidate_value)
        
        return merged
    
    def _validate_metadata(self, metadata: BookMetadata) -> Dict:
        """Validate and score metadata completeness and quality."""
        score = 0.0
        total_possible = 0.0
        issues = []
        
        # Required fields scoring
        required_fields = {
            'title': 0.2,
            'authors': 0.15,
            'description': 0.1,
            'publication_date': 0.1,
            'isbn_13': 0.1,
            'publisher': 0.05,
            'language': 0.05,
            'page_count': 0.05,
            'cover_url': 0.1,
            'genres': 0.1
        }
        
        for field, weight in required_fields.items():
            total_possible += weight
            value = getattr(metadata, field)
            
            if value:
                if isinstance(value, list) and len(value) > 0:
                    score += weight
                elif isinstance(value, str) and value.strip():
                    score += weight
                elif isinstance(value, (int, float)) and value > 0:
                    score += weight
                else:
                    issues.append(f"Invalid {field}: {value}")
            else:
                issues.append(f"Missing {field}")
        
        # Quality checks
        if metadata.description and len(metadata.description) < 50:
            score -= 0.05
            issues.append("Description too short")
        
        if metadata.title and len(metadata.title) < 3:
            score -= 0.1
            issues.append("Title too short")
        
        # ISBN validation
        if metadata.isbn_13 and not self._validate_isbn13(metadata.isbn_13):
            score -= 0.05
            issues.append("Invalid ISBN-13")
        
        if metadata.isbn_10 and not self._validate_isbn10(metadata.isbn_10):
            score -= 0.05
            issues.append("Invalid ISBN-10")
        
        # Date validation
        if metadata.publication_date:
            try:
                datetime.fromisoformat(metadata.publication_date.replace('Z', '+00:00'))
            except:
                score -= 0.05
                issues.append("Invalid publication date format")
        
        confidence_score = max(0.0, min(1.0, score / total_possible))
        
        return {
            'confidence_score': confidence_score,
            'issues': issues,
            'completeness_score': score / total_possible
        }
    
    def _validate_isbn13(self, isbn: str) -> bool:
        """Validate ISBN-13 format and checksum."""
        # Remove hyphens and spaces
        isbn = re.sub(r'[-\s]', '', isbn)
        
        if len(isbn) != 13 or not isbn.isdigit():
            return False
        
        # Calculate checksum
        total = 0
        for i, digit in enumerate(isbn[:-1]):
            weight = 1 if i % 2 == 0 else 3
            total += int(digit) * weight
        
        checksum = (10 - (total % 10)) % 10
        return checksum == int(isbn[-1])
    
    def _validate_isbn10(self, isbn: str) -> bool:
        """Validate ISBN-10 format and checksum."""
        # Remove hyphens and spaces
        isbn = re.sub(r'[-\s]', '', isbn)
        
        if len(isbn) != 10:
            return False
        
        # Check if all characters except last are digits
        if not isbn[:-1].isdigit():
            return False
        
        # Last character can be digit or 'X'
        if isbn[-1] not in '0123456789X':
            return False
        
        # Calculate checksum
        total = 0
        for i, char in enumerate(isbn[:-1]):
            total += int(char) * (10 - i)
        
        checksum = (11 - (total % 11)) % 11
        expected = 'X' if checksum == 10 else str(checksum)
        
        return expected == isbn[-1]
    
    async def _download_cover_image(self, book_id: int, cover_url: str) -> Optional[str]:
        """Download and save cover image locally."""
        try:
            # Create covers directory
            self.cover_storage_path.mkdir(exist_ok=True)
            
            # Generate filename
            url_hash = hashlib.md5(cover_url.encode()).hexdigest()[:8]
            filename = f"book_{book_id}_{url_hash}.jpg"
            local_path = self.cover_storage_path / filename
            
            # Skip if already exists
            if local_path.exists():
                return str(local_path)
            
            # Download image
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(cover_url) as response:
                    if response.status == 200:
                        content = await response.read()
                        
                        # Save original image
                        with open(local_path, 'wb') as f:
                            f.write(content)
                        
                        # Optimize image
                        try:
                            with Image.open(local_path) as img:
                                # Resize if too large
                                if img.width > 600 or img.height > 800:
                                    img.thumbnail((600, 800), Image.Resampling.LANCZOS)
                                
                                # Convert to RGB if necessary
                                if img.mode != 'RGB':
                                    img = img.convert('RGB')
                                
                                # Save optimized version
                                img.save(local_path, 'JPEG', quality=85, optimize=True)
                        
                        except Exception as e:
                            logger.warning(f"Could not optimize cover image: {e}")
                        
                        logger.info(f"Downloaded cover for book {book_id}: {filename}")
                        return str(local_path)
                    else:
                        logger.warning(f"Failed to download cover: HTTP {response.status}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error downloading cover image: {e}")
            return None
    
    async def _store_enriched_metadata(self, book_id: int, metadata: BookMetadata):
        """Store enriched metadata in the database."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Update book record
                cursor.execute("""
                    UPDATE books 
                    SET subtitle = ?, description = ?, isbn_10 = ?, isbn_13 = ?,
                        asin = ?, google_books_id = ?, goodreads_id = ?,
                        publication_date = ?, page_count = ?, rating_average = ?,
                        rating_count = ?, cover_url = ?, tags = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    metadata.subtitle, metadata.description, metadata.isbn_10,
                    metadata.isbn_13, metadata.asin, metadata.google_books_id,
                    metadata.goodreads_id, metadata.publication_date,
                    metadata.page_count, metadata.rating, metadata.rating_count,
                    metadata.cover_url, json.dumps(metadata.tags or []),
                    datetime.now().isoformat(), book_id
                ))
                
                # Update or create publisher
                if metadata.publisher:
                    cursor.execute("""
                        INSERT OR IGNORE INTO publishers (name) VALUES (?)
                    """, (metadata.publisher,))
                    
                    cursor.execute("""
                        UPDATE books 
                        SET publisher_id = (SELECT id FROM publishers WHERE name = ?)
                        WHERE id = ?
                    """, (metadata.publisher, book_id))
                
                # Update or create language
                if metadata.language:
                    cursor.execute("""
                        INSERT OR IGNORE INTO languages (code, name) VALUES (?, ?)
                    """, (metadata.language, metadata.language))
                    
                    cursor.execute("""
                        UPDATE books 
                        SET language_id = (SELECT id FROM languages WHERE code = ?)
                        WHERE id = ?
                    """, (metadata.language, book_id))
                
                # Update or create series
                if metadata.series:
                    cursor.execute("""
                        INSERT OR IGNORE INTO series (name) VALUES (?)
                    """, (metadata.series,))
                    
                    cursor.execute("""
                        UPDATE books 
                        SET series_id = (SELECT id FROM series WHERE name = ?),
                            series_position = ?
                        WHERE id = ?
                    """, (metadata.series, metadata.series_position, book_id))
                
                # Update authors
                if metadata.authors:
                    # Clear existing authors
                    cursor.execute("DELETE FROM book_authors WHERE book_id = ?", (book_id,))
                    
                    for author_name in metadata.authors:
                        if author_name.strip():
                            # Create or get author
                            cursor.execute("""
                                INSERT OR IGNORE INTO authors (name, sort_name) 
                                VALUES (?, ?)
                            """, (author_name, self._create_sort_name(author_name)))
                            
                            # Link to book
                            cursor.execute("""
                                INSERT INTO book_authors (book_id, author_id, role)
                                SELECT ?, id, 'author' FROM authors WHERE name = ?
                            """, (book_id, author_name))
                
                # Update genres
                if metadata.genres:
                    # Clear existing genres
                    cursor.execute("DELETE FROM book_genres WHERE book_id = ?", (book_id,))
                    
                    for genre_name in metadata.genres:
                        if genre_name.strip():
                            # Create or get genre
                            cursor.execute("""
                                INSERT OR IGNORE INTO genres (name) VALUES (?)
                            """, (genre_name,))
                            
                            # Link to book
                            cursor.execute("""
                                INSERT INTO book_genres (book_id, genre_id)
                                SELECT ?, id FROM genres WHERE name = ?
                            """, (book_id, genre_name))
                
                conn.commit()
                logger.info(f"Stored enriched metadata for book {book_id}")
                
        except Exception as e:
            logger.error(f"Error storing enriched metadata: {e}")
            raise
    
    def _create_sort_name(self, author_name: str) -> str:
        """Create sort name for author (Last, First)."""
        parts = author_name.split()
        if len(parts) >= 2:
            return f"{parts[-1]}, {' '.join(parts[:-1])}"
        return author_name
    
    async def process_batch(self, limit: int = 50) -> Dict:
        """Process a batch of books needing enrichment."""
        logger.info(f"Starting batch processing (limit: {limit})")
        
        books_to_process = self.get_books_needing_enrichment(limit)
        if not books_to_process:
            logger.info("No books need enrichment")
            return {'processed': 0, 'successful': 0, 'failed': 0}
        
        logger.info(f"Processing {len(books_to_process)} books")
        
        # Process books with concurrency control
        semaphore = asyncio.Semaphore(self.max_concurrent_requests)
        
        async def process_with_semaphore(book_data):
            async with semaphore:
                return await self.enrich_book_metadata(book_data)
        
        # Create tasks for all books
        tasks = [process_with_semaphore(book) for book in books_to_process]
        
        # Process results
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        successful = 0
        failed = 0
        total_confidence = 0.0
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Exception processing book {books_to_process[i]['id']}: {result}")
                failed += 1
            elif isinstance(result, EnrichmentResult):
                if result.success:
                    successful += 1
                    total_confidence += result.confidence_score
                    self.processing_stats['successful_enrichments'] += 1
                    
                    # Update source usage stats
                    for source in result.sources_used:
                        source_name = source.value
                        self.processing_stats['metadata_sources_used'][source_name] = \
                            self.processing_stats['metadata_sources_used'].get(source_name, 0) + 1
                else:
                    failed += 1
                    self.processing_stats['failed_enrichments'] += 1
                
                self.processing_stats['total_processed'] += 1
        
        # Update average confidence score
        if successful > 0:
            self.processing_stats['avg_confidence_score'] = total_confidence / successful
        
        summary = {
            'processed': len(books_to_process),
            'successful': successful,
            'failed': failed,
            'success_rate': (successful / len(books_to_process)) * 100,
            'avg_confidence_score': total_confidence / successful if successful > 0 else 0.0
        }
        
        logger.info(f"Batch processing completed: {summary}")
        return summary
    
    def generate_enrichment_report(self) -> Dict:
        """Generate comprehensive enrichment report."""
        try:
            with self.get_database_connection() as conn:
                cursor = conn.cursor()
                
                # Books with missing metadata
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_books,
                        SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END) as missing_description,
                        SUM(CASE WHEN publication_date IS NULL THEN 1 ELSE 0 END) as missing_pub_date,
                        SUM(CASE WHEN page_count IS NULL THEN 1 ELSE 0 END) as missing_page_count,
                        SUM(CASE WHEN rating_average IS NULL THEN 1 ELSE 0 END) as missing_rating,
                        SUM(CASE WHEN cover_url IS NULL OR cover_url = '' THEN 1 ELSE 0 END) as missing_cover,
                        SUM(CASE WHEN isbn_13 IS NULL OR isbn_13 = '' THEN 1 ELSE 0 END) as missing_isbn
                    FROM books
                """)
                
                metadata_stats = dict(cursor.fetchone())
                
                # Recently enriched books
                cursor.execute("""
                    SELECT COUNT(*) as recently_enriched
                    FROM books 
                    WHERE updated_at > datetime('now', '-7 days')
                    AND (description IS NOT NULL AND description != '')
                """)
                
                recently_enriched = cursor.fetchone()[0]
                
                # Top missing metadata fields
                missing_fields = []
                for field, count in metadata_stats.items():
                    if field.startswith('missing_') and count > 0:
                        field_name = field.replace('missing_', '')
                        percentage = (count / metadata_stats['total_books']) * 100
                        missing_fields.append({
                            'field': field_name,
                            'missing_count': count,
                            'percentage': round(percentage, 1)
                        })
                
                missing_fields.sort(key=lambda x: x['missing_count'], reverse=True)
                
                return {
                    'timestamp': datetime.now().isoformat(),
                    'summary': {
                        'total_books': metadata_stats['total_books'],
                        'recently_enriched': recently_enriched,
                        'enrichment_candidates': sum(
                            count for field, count in metadata_stats.items()
                            if field.startswith('missing_')
                        )
                    },
                    'missing_metadata': missing_fields,
                    'processing_statistics': self.processing_stats,
                    'configuration': {
                        'max_concurrent_requests': self.max_concurrent_requests,
                        'min_confidence_threshold': self.min_confidence_threshold,
                        'cover_download_enabled': self.enable_cover_download
                    }
                }
                
        except Exception as e:
            logger.error(f"Error generating enrichment report: {e}")
            return {'error': str(e), 'timestamp': datetime.now().isoformat()}


def main():
    parser = argparse.ArgumentParser(description='FolioFox Book Metadata Enricher')
    parser.add_argument('--config', default='./config/config.yaml', help='Configuration file path')
    parser.add_argument('--mode', choices=['batch', 'single', 'report'], default='batch',
                       help='Operation mode')
    parser.add_argument('--book-id', type=int, help='Specific book ID for single mode')
    parser.add_argument('--limit', type=int, default=50, help='Batch processing limit')
    
    args = parser.parse_args()
    
    enricher = MetadataEnricher(args.config)
    
    if args.mode == 'single':
        if not args.book_id:
            print("--book-id required for single mode")
            sys.exit(1)
        
        # Process single book
        async def process_single():
            # Get book data
            with enricher.get_database_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT b.*, GROUP_CONCAT(a.name, '; ') as authors
                    FROM books b
                    LEFT JOIN book_authors ba ON b.id = ba.book_id
                    LEFT JOIN authors a ON ba.author_id = a.id
                    WHERE b.id = ?
                    GROUP BY b.id
                """, (args.book_id,))
                
                row = cursor.fetchone()
                if not row:
                    print(f"Book with ID {args.book_id} not found")
                    return
                
            book_data = dict(row)
            result = await enricher.enrich_book_metadata(book_data)
            print(json.dumps(asdict(result), indent=2, default=str))
        
        asyncio.run(process_single())
        
    elif args.mode == 'report':
        # Generate and print report
        report = enricher.generate_enrichment_report()
        print(json.dumps(report, indent=2, default=str))
        
    else:
        # Batch processing
        async def run_batch():
            return await enricher.process_batch(args.limit)
        
        summary = asyncio.run(run_batch())
        print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()