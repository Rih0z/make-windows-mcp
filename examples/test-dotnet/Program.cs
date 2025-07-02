using System;

namespace TestApp
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("=================================");
            Console.WriteLine("Hello from Windows MCP Server!");
            Console.WriteLine("=================================");
            Console.WriteLine($"Built at: {DateTime.Now}");
            Console.WriteLine($"OS: {Environment.OSVersion}");
            Console.WriteLine($".NET Version: {Environment.Version}");
            Console.WriteLine("=================================");
            Console.WriteLine("\nBuild successful!");
        }
    }
}