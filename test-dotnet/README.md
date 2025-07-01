# Test .NET Application

This is a simple test application to verify the Windows MCP Build Server functionality.

## Build Instructions

1. Copy to Windows local directory:
   ```powershell
   Copy-Item -Path Z:\windows\test-dotnet -Destination C:\temp\test-dotnet -Recurse -Force
   ```

2. Build the application:
   ```bash
   @windows-build-server build_dotnet projectPath="C:\\temp\\test-dotnet\\TestApp.csproj" configuration="Release"
   ```

## Expected Output

When built successfully, you should see:
```
ビルドに成功しました。
    0 個の警告
    0 エラー

TestApp -> C:\temp\test-dotnet\bin\Release\net6.0\TestApp.dll
```

## Notes

- This test confirms that .NET SDK is properly installed
- Building from network drives (Z:) directly may fail
- Always copy to local directory (C:) before building