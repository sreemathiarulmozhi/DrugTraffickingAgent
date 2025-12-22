import requests
import time

def simple_test():
    print("Simple Drug Detector Test")
    print("=" * 40)
    
    # Test cases without emojis (use text codes)
    tests = [
        ("Cocaine code", "Fresh snow available. DM for menu. Fast delivery.", "risky"),
        ("Weed code", "Garden supplies available. Contact for strains. Delivery.", "risky"),
        ("Safe post", "Beautiful day at the park. Perfect weather.", "safe"),
        ("Pills code", "Pharma grade available. DM for selection.", "risky"),
        ("Winter post", "First snow of winter! Time for hot chocolate.", "safe"),
    ]
    
    results = []
    
    for name, content, expected in tests:
        print(f"\nTest: {name}")
        print(f"Content: {content}")
        
        try:
            response = requests.post(
                "http://127.0.0.1:8000/api/analyze",
                json={"url": "test", "test_content": content},
                timeout=10
            )
            
            result = response.json()
            label = result['classification']['label']
            score = result['classification']['score']
            
            correct = label == expected
            results.append(correct)
            
            print(f"Result: {label} (expected: {expected})")
            print(f"Score: {score:.2f}")
            print(f"{'✅ PASS' if correct else '❌ FAIL'}")
            
        except Exception as e:
            print(f"Error: {e}")
            results.append(False)
        
        time.sleep(0.5)
    
    # Summary
    print("\n" + "=" * 40)
    print(f"Results: {sum(results)}/{len(tests)} correct")
    print(f"Accuracy: {(sum(results)/len(tests)*100):.1f}%")

if __name__ == "__main__":
    simple_test()