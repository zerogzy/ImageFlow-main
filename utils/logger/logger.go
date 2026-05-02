package logger

import (
	"fmt"
	"os"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	Log       *zap.Logger
	debugMode bool
)

func InitBasicLogger() error {
	config := zap.NewProductionConfig()
	config.EncoderConfig = zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		FunctionKey:    zapcore.OmitKey,
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(config.EncoderConfig),
		zapcore.AddSync(os.Stdout),
		zapcore.InfoLevel,
	)

	Log = zap.New(core, zap.AddCaller())

	if Log == nil {
		return fmt.Errorf("failed to initialize basic logger")
	}

	return nil
}

func InitLogger(cfg *config.Config) error {
	debugMode = cfg.DebugMode

	config := zap.NewProductionConfig()

	if debugMode {
		config.Level = zap.NewAtomicLevelAt(zap.DebugLevel)
	} else {
		config.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	}

	config.EncoderConfig = zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		FunctionKey:    zapcore.OmitKey,
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	var cores []zapcore.Core

	// Configure lumberjack for log rotation; fall back to stdout if logs/ is unwritable
	logRotator := &lumberjack.Logger{
		Filename:   "logs/imageflow.log",
		MaxSize:    100,
		MaxBackups: 30,
		MaxAge:     7,
		Compress:   true,
	}

	// Try to ensure log directory exists
	if err := os.MkdirAll("logs", 0755); err == nil {
		cores = append(cores, zapcore.NewCore(
			zapcore.NewJSONEncoder(config.EncoderConfig),
			zapcore.AddSync(logRotator),
			config.Level,
		))
	} else {
		fmt.Fprintf(os.Stderr, "WARNING: Cannot create logs/ directory (%v), logging to stdout only\n", err)
		cores = append(cores, zapcore.NewCore(
			zapcore.NewConsoleEncoder(config.EncoderConfig),
			zapcore.AddSync(os.Stdout),
			config.Level,
		))
	}

	if debugMode {
		// Always add console output in debug mode
		if _, err := os.Stat("logs"); err == nil {
			cores = append(cores, zapcore.NewCore(
				zapcore.NewConsoleEncoder(config.EncoderConfig),
				zapcore.AddSync(os.Stdout),
				config.Level,
			))
		}
	}

	core := zapcore.NewTee(cores...)
	Log = zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))

	if Log == nil {
		return fmt.Errorf("failed to initialize logger with config")
	}

	Info("Logger initialized",
		zap.Bool("debug_mode", debugMode),
		zap.String("log_level", config.Level.String()))

	return nil
}

func IsDebugMode() bool {
	return debugMode
}

func Debug(msg string, fields ...zap.Field) {
	if debugMode {
		Log.Debug(msg, fields...)
	}
}

func Info(msg string, fields ...zap.Field) {
	Log.Info(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	Log.Warn(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	Log.Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	Log.Fatal(msg, fields...)
}

func With(fields ...zap.Field) *zap.Logger {
	return Log.With(fields...)
}
