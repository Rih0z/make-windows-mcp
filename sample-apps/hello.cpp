#include <iostream>
#include <windows.h>
#include <ctime>

int main() {
    std::cout << "Hello from Windows MCP Server (C++)!" << std::endl;
    
    // Get current time
    time_t now = time(0);
    char* timeStr = ctime(&now);
    std::cout << "Built at: " << timeStr;
    
    // Get Windows version
    OSVERSIONINFO osvi;
    ZeroMemory(&osvi, sizeof(OSVERSIONINFO));
    osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFO);
    
    std::cout << "Windows Build: " << GetVersion() << std::endl;
    
    std::cout << "\nPress Enter to exit...";
    std::cin.get();
    
    return 0;
}