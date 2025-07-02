using System;

namespace HelloWorld
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello from Windows MCP Server!");
            Console.WriteLine("Built at: " + DateTime.Now);
            Console.WriteLine("Platform: " + Environment.OSVersion);
            
            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }
    }
}