package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var (
	sourcePath     = flag.String("source", "", "Source image directory")
	targetPath     = flag.String("target", "", "Target image directory")
	format         = flag.String("format", "webp", "Conversion format (webp or avif)")
	quality        = flag.Int("quality", 80, "Image quality (1-100)")
	workers        = flag.Int("workers", 0, "Number of parallel worker threads (0 = auto-detect)")
	effort         = flag.Int("effort", 4, "Compression effort (0-10, higher is slower but better quality)")
	lossless       = flag.Bool("lossless", false, "Force lossless mode for all images (not just PNGs)")
	pngCompression = flag.String("png-mode", "auto", "PNG compression mode: auto, lossy, lossless")
)

func main() {
	flag.Parse()

	// Validate input parameters
	validateInputParameters()

	// Auto-detect worker count if not specified
	if *workers <= 0 {
		*workers = runtime.NumCPU()
		fmt.Printf("Auto-detected %d CPU cores, using %d worker threads\n", runtime.NumCPU(), *workers)
	}

	// Ensure target directory exists
	if err := os.MkdirAll(*targetPath, 0755); err != nil {
		log.Fatalf("Failed to create target directory: %v", err)
	}

	// Get all image files
	files, err := findImageFiles(*sourcePath)
	if err != nil {
		log.Fatalf("Failed to scan source directory: %v", err)
	}

	fmt.Printf("Found %d image files\n", len(files))

	// Process images in parallel using worker pool
	processImagesInParallel(files)
}

// validateInputParameters checks that required parameters are provided and valid
func validateInputParameters() {
	if *sourcePath == "" || *targetPath == "" {
		log.Fatal("Source and target directories must be specified")
	}

	if *format != "webp" && *format != "avif" {
		log.Fatal("Format must be either webp or avif")
	}

	if *quality < 1 || *quality > 100 {
		log.Fatal("Quality must be between 1 and 100")
	}

	if *effort < 0 || *effort > 10 {
		log.Fatal("Effort must be between 0 and 10")
	}

	if *pngCompression != "auto" && *pngCompression != "lossy" && *pngCompression != "lossless" {
		log.Fatal("PNG mode must be 'auto', 'lossy', or 'lossless'")
	}
}

// findImageFiles returns a list of all image files in the given directory
func findImageFiles(rootPath string) ([]string, error) {
	var files []string
	err := filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
				files = append(files, path)
			}
		}
		return nil
	})
	return files, err
}

// processImagesInParallel converts images in parallel using a worker pool
func processImagesInParallel(files []string) {
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, *workers)

	for _, file := range files {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(file string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			// Get output file path
			outFile, err := getOutputFilePath(file)
			if err != nil {
				log.Printf("Error: %v", err)
				return
			}

			// Create output directory
			outDir := filepath.Dir(outFile)
			if err := os.MkdirAll(outDir, 0755); err != nil {
				log.Printf("Failed to create output directory %s: %v", outDir, err)
				return
			}

			// Convert the image
			cmd := buildConversionCommand(file, outFile)
			if cmd == nil {
				return // Error already logged
			}

			// Run the conversion
			if err := runConversion(cmd, file, outFile); err != nil {
				log.Printf("Error: %v", err)
				return
			}

			fmt.Printf("Converted: %s -> %s\n", file, outFile)
		}(file)
	}

	wg.Wait()
	fmt.Println("Conversion complete!")
}

// getOutputFilePath determines the path for the output file
func getOutputFilePath(inputFile string) (string, error) {
	relPath, err := filepath.Rel(*sourcePath, inputFile)
	if err != nil {
		return "", fmt.Errorf("failed to calculate relative path for %s: %v", inputFile, err)
	}
	return filepath.Join(*targetPath, strings.TrimSuffix(relPath, filepath.Ext(relPath))+"."+*format), nil
}

// buildConversionCommand creates the appropriate conversion command based on format and options
func buildConversionCommand(inputFile, outputFile string) *exec.Cmd {
	isPNG := strings.ToLower(filepath.Ext(inputFile)) == ".png"

	// Only use lossless if explicitly requested or png-mode is set to lossless
	useLossless := *lossless || (isPNG && *pngCompression == "lossless")

	if *format == "webp" {
		return buildWebPCommand(inputFile, outputFile, isPNG, useLossless)
	} else if *format == "avif" {
		return buildAVIFCommand(inputFile, outputFile, isPNG, useLossless)
	}

	log.Printf("Unsupported format: %s", *format)
	return nil
}

// buildWebPCommand creates command for WebP conversion
func buildWebPCommand(inputFile, outputFile string, isPNG, useLossless bool) *exec.Cmd {
	// Base arguments
	args := []string{"-q", fmt.Sprintf("%d", *quality)}

	// Add effort level if supported
	args = append(args, "-m", fmt.Sprintf("%d", *effort))

	// Add multi-threading support
	args = append(args, "-mt")

	// Use lossless for PNG files with transparency or if explicitly requested
	if useLossless {
		args = append(args, "-lossless")
	}

	// Add input and output files
	args = append(args, inputFile, "-o", outputFile)

	return exec.Command("cwebp", args...)
}

// buildAVIFCommand creates command for AVIF conversion
func buildAVIFCommand(inputFile, outputFile string, isPNG, useLossless bool) *exec.Cmd {
	args := []string{}

	// Set speed/effort (0-10, higher is slower but better quality)
	args = append(args, "-s", fmt.Sprintf("%d", 10-*effort)) // AVIF uses opposite scale

	// Add multi-threading support
	args = append(args, "--jobs", fmt.Sprintf("%d", *workers))

	// Handle lossless mode - in AVIF we can't set quality with lossless
	if useLossless {
		args = append(args, "--lossless")
	} else {
		// Only set quality if not in lossless mode
		args = append(args, "-q", fmt.Sprintf("%d", *quality))
	}

	// Add input and output files
	args = append(args, inputFile, outputFile)

	return exec.Command("avifenc", args...)
}

// runConversion executes the conversion command and handles errors
func runConversion(cmd *exec.Cmd, inputFile, outputFile string) error {
	// Log the command being executed for debugging
	log.Printf("Running: %s %s", cmd.Path, strings.Join(cmd.Args[1:], " "))

	// Execute the command
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("conversion failed for %s: %v\nOutput: %s", inputFile, err, string(output))
	}

	// Verify the output file exists and has content
	info, err := os.Stat(outputFile)
	if err != nil {
		return fmt.Errorf("output file not created: %v", err)
	}

	if info.Size() == 0 {
		return fmt.Errorf("output file is empty: %s", outputFile)
	}

	return nil
}
