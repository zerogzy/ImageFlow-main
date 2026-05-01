package utils

import (
	"net/http"
	"regexp"
	"strings"
)

type DeviceType int

const (
	Desktop DeviceType = iota
	Mobile
)

// String constants for device types
const (
	DeviceMobile  = "mobile"
	DeviceDesktop = "desktop"
)

var (
	mobileRegex = regexp.MustCompile(`(?i)(android|webos|iphone|ipad|ipod|blackberry|windows phone)`)
)

// DetectDevice returns the DeviceType enum (Mobile or Desktop) based on User-Agent
func DetectDevice(r *http.Request) DeviceType {
	userAgent := r.Header.Get("User-Agent")
	if mobileRegex.MatchString(userAgent) {
		return Mobile
	}
	return Desktop
}

// DetectDeviceType returns a string identifier ("mobile" or "desktop") based on User-Agent
func DetectDeviceType(r *http.Request) string {
	// Detect device type from User-Agent
	userAgent := r.Header.Get("User-Agent")
	return GetDeviceTypeFromUserAgent(userAgent)
}

// GetDeviceTypeFromUserAgent extracts device type from a User-Agent string
func GetDeviceTypeFromUserAgent(userAgent string) string {
	userAgent = strings.ToLower(userAgent)
	mobilePlatforms := []string{
		"android", "webos", "iphone", "ipad", "ipod", "blackberry", "windows phone",
	}

	for _, platform := range mobilePlatforms {
		if strings.Contains(userAgent, platform) {
			return DeviceMobile
		}
	}
	return DeviceDesktop
}
