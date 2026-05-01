package utils

import (
	"errors"
	"io"
)

var ErrInvalidOffset = errors.New("invalid offset")

// String returns a pointer to the string value passed in
func String(v string) *string {
	return &v
}

// ReadSeeker converts an io.Reader to an io.ReadSeeker by reading all content into memory
func ReadSeeker(r io.Reader) (io.ReadSeeker, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	return NewByteReadSeeker(data), nil
}

// ByteReadSeeker implements io.ReadSeeker for a byte slice
type ByteReadSeeker struct {
	data   []byte
	offset int64
}

func NewByteReadSeeker(data []byte) *ByteReadSeeker {
	return &ByteReadSeeker{data: data}
}

func (b *ByteReadSeeker) Read(p []byte) (n int, err error) {
	if b.offset >= int64(len(b.data)) {
		return 0, io.EOF
	}
	n = copy(p, b.data[b.offset:])
	b.offset += int64(n)
	return
}

func (b *ByteReadSeeker) Seek(offset int64, whence int) (int64, error) {
	var abs int64
	switch whence {
	case io.SeekStart:
		abs = offset
	case io.SeekCurrent:
		abs = b.offset + offset
	case io.SeekEnd:
		abs = int64(len(b.data)) + offset
	default:
		return 0, ErrInvalidOffset
	}
	if abs < 0 {
		return 0, ErrInvalidOffset
	}
	b.offset = abs
	return abs, nil
}
