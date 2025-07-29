import { http, HttpResponse } from 'msw'
import { Book, BooksResponse } from '@/types'

const mockBooks: Book[] = [
  {
    id: 1,
    title: 'The Great Gatsby',
    subtitle: null,
    description: 'A classic American novel about the Jazz Age',
    isbn_10: '0123456789',
    isbn_13: '978-0123456789',
    asin: null,
    goodreads_id: '12345',
    google_books_id: 'abc123',
    publication_date: '1925-04-10',
    page_count: 180,
    language: { id: 1, code: 'en', name: 'English' },
    publisher: { id: 1, name: 'Scribner' },
    series: null,
    series_position: null,
    authors: [
      { id: 1, name: 'F. Scott Fitzgerald', role: 'author' }
    ],
    genres: [
      { id: 1, name: 'Classic Literature' },
      { id: 2, name: 'American Literature' }
    ],
    rating_average: 4.2,
    rating_count: 1500,
    tags: ['classic', 'american', 'jazz age'],
    cover_url: 'https://example.com/covers/gatsby.jpg',
    cover_local_path: null,
    available_formats: 3,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'To Kill a Mockingbird',
    subtitle: null,
    description: 'A novel about racial injustice and childhood in the American South',
    isbn_10: '0987654321',
    isbn_13: '978-0987654321',
    asin: null,
    goodreads_id: '54321',
    google_books_id: 'def456',
    publication_date: '1960-07-11',
    page_count: 281,
    language: { id: 1, code: 'en', name: 'English' },
    publisher: { id: 2, name: 'J.B. Lippincott & Co.' },
    series: null,
    series_position: null,
    authors: [
      { id: 2, name: 'Harper Lee', role: 'author' }
    ],
    genres: [
      { id: 1, name: 'Classic Literature' },
      { id: 3, name: 'Social Issues' }
    ],
    rating_average: 4.5,
    rating_count: 2000,
    tags: ['classic', 'social justice', 'coming of age'],
    cover_url: 'https://example.com/covers/mockingbird.jpg',
    cover_local_path: null,
    available_formats: 2,
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
]

export const libraryHandlers = [
  // Get books
  http.get('/api/v1/books', ({ request }) => {
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const search = url.searchParams.get('search')
    const author = url.searchParams.get('author')
    const genre = url.searchParams.get('genre')
    
    let filteredBooks = mockBooks
    
    if (search) {
      filteredBooks = filteredBooks.filter(book =>
        book.title.toLowerCase().includes(search.toLowerCase()) ||
        book.authors.some(a => a.name.toLowerCase().includes(search.toLowerCase()))
      )
    }
    
    if (author) {
      filteredBooks = filteredBooks.filter(book =>
        book.authors.some(a => a.name.toLowerCase().includes(author.toLowerCase()))
      )
    }
    
    if (genre) {
      filteredBooks = filteredBooks.filter(book =>
        book.genres.some(g => g.name.toLowerCase().includes(genre.toLowerCase()))
      )
    }
    
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedBooks = filteredBooks.slice(startIndex, endIndex)
    
    const response: BooksResponse = {
      books: paginatedBooks,
      pagination: {
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(filteredBooks.length / limit),
        total_items: filteredBooks.length,
        has_next: endIndex < filteredBooks.length,
        has_prev: page > 1,
        next_page: endIndex < filteredBooks.length ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
      },
      total_count: filteredBooks.length,
    }
    
    return HttpResponse.json(response)
  }),

  // Get specific book
  http.get('/api/v1/books/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const book = mockBooks.find(b => b.id === id)
    
    if (!book) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Book with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    return HttpResponse.json(book)
  }),

  // Add book
  http.post('/api/v1/books', async ({ request }) => {
    const body = await request.json() as any
    
    const newBook: Book = {
      id: mockBooks.length + 1,
      title: body.title,
      subtitle: body.subtitle || null,
      description: body.description || null,
      isbn_10: body.isbn_10 || null,
      isbn_13: body.isbn_13 || null,
      asin: body.asin || null,
      goodreads_id: body.goodreads_id || null,
      google_books_id: body.google_books_id || null,
      publication_date: body.publication_date || null,
      page_count: body.page_count || null,
      language: body.language || null,
      publisher: body.publisher || null,
      series: body.series || null,
      series_position: body.series_position || null,
      authors: body.authors || [],
      genres: body.genres || [],
      rating_average: body.rating_average || null,
      rating_count: body.rating_count || 0,
      tags: body.tags || [],
      cover_url: body.cover_url || null,
      cover_local_path: body.cover_local_path || null,
      available_formats: body.available_formats || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    mockBooks.push(newBook)
    
    return HttpResponse.json(newBook, { status: 201 })
  }),

  // Update book
  http.patch('/api/v1/books/:id', async ({ params, request }) => {
    const id = parseInt(params.id as string)
    const body = await request.json() as any
    const bookIndex = mockBooks.findIndex(b => b.id === id)
    
    if (bookIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Book with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockBooks[bookIndex] = {
      ...mockBooks[bookIndex],
      ...body,
      updated_at: new Date().toISOString(),
    }
    
    return HttpResponse.json(mockBooks[bookIndex])
  }),

  // Delete book
  http.delete('/api/v1/books/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const bookIndex = mockBooks.findIndex(b => b.id === id)
    
    if (bookIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Book with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockBooks.splice(bookIndex, 1)
    
    return HttpResponse.json({ message: 'Book deleted successfully' })
  }),
]