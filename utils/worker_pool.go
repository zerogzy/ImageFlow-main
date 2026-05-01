package utils

import (
	"sync"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// Task represents a unit of work to be processed by the worker pool
type Task struct {
	Process func() ([]byte, error)
	Result  chan TaskResult
}

// TaskResult represents the result of a task execution
type TaskResult struct {
	Data  []byte
	Error error
}

// WorkerPool manages a pool of workers for concurrent task processing
type WorkerPool struct {
	taskQueue   chan Task
	workerCount int
	wg          sync.WaitGroup
	once        sync.Once
}

var (
	globalPool *WorkerPool
	poolMutex  sync.Mutex
)

// InitWorkerPool initializes the global worker pool with the specified configuration
func InitWorkerPool(cfg *config.Config) *WorkerPool {
	poolMutex.Lock()
	defer poolMutex.Unlock()

	if globalPool == nil {
		globalPool = &WorkerPool{
			taskQueue:   make(chan Task, cfg.WorkerPoolSize*2), // Buffer size is double the worker count
			workerCount: cfg.WorkerPoolSize,
		}
		globalPool.start()
		logger.Info("Worker pool initialized",
			zap.Int("worker_count", cfg.WorkerPoolSize),
			zap.Int("queue_size", cfg.WorkerPoolSize*2))
	}
	return globalPool
}

// GetWorkerPool returns the global worker pool instance
func GetWorkerPool() *WorkerPool {
	poolMutex.Lock()
	defer poolMutex.Unlock()

	if globalPool == nil {
		logger.Warn("Worker pool accessed before initialization, using default configuration")
		// Use a default configuration if not initialized
		defaultCfg := &config.Config{WorkerPoolSize: 10}
		globalPool = &WorkerPool{
			taskQueue:   make(chan Task, defaultCfg.WorkerPoolSize*2),
			workerCount: defaultCfg.WorkerPoolSize,
		}
		globalPool.start()
	}
	return globalPool
}

// start launches worker goroutines
func (p *WorkerPool) start() {
	p.once.Do(func() {
		p.wg.Add(p.workerCount)
		logger.Info("Starting worker pool",
			zap.Int("worker_count", p.workerCount))
		for i := 0; i < p.workerCount; i++ {
			go p.worker(i)
		}
	})
}

// worker processes tasks from the queue
func (p *WorkerPool) worker(id int) {
	defer p.wg.Done()

	logger.Debug("Worker started",
		zap.Int("worker_id", id))

	for task := range p.taskQueue {
		logger.Debug("Processing task",
			zap.Int("worker_id", id))

		data, err := task.Process()
		if err != nil {
			logger.Error("Task processing failed",
				zap.Int("worker_id", id),
				zap.Error(err))
		} else {
			logger.Debug("Task completed successfully",
				zap.Int("worker_id", id),
				zap.Int("data_size", len(data)))
		}

		task.Result <- TaskResult{Data: data, Error: err}
		close(task.Result)
	}

	logger.Debug("Worker stopped",
		zap.Int("worker_id", id))
}

// Submit adds a task to the worker pool queue and returns a channel for the result
func (p *WorkerPool) Submit(process func() ([]byte, error)) <-chan TaskResult {
	resultChan := make(chan TaskResult, 1)
	p.taskQueue <- Task{
		Process: process,
		Result:  resultChan,
	}
	logger.Debug("Task submitted to worker pool")
	return resultChan
}

// ProcessTask submits a task to the worker pool and waits for the result
func (p *WorkerPool) ProcessTask(process func() ([]byte, error)) ([]byte, error) {
	resultChan := p.Submit(process)
	result := <-resultChan
	if result.Error != nil {
		logger.Error("Task processing failed", zap.Error(result.Error))
	}
	return result.Data, result.Error
}

// Shutdown gracefully stops the worker pool after all tasks are processed
func (p *WorkerPool) Shutdown() {
	logger.Info("Initiating worker pool shutdown")
	close(p.taskQueue)
	p.wg.Wait()
	logger.Info("Worker pool shutdown complete",
		zap.Int("worker_count", p.workerCount))
}
