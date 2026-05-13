#include <iostream>
#include <string>

class MemoryPool {
public:
    void* allocate(size_t size) {
        return new char[size];  // No null check
    }
    void deallocate(void* ptr) {
        delete[] (char*)ptr;  // No null check
    }
};

// Use after free
void buggy_function() {
    MemoryPool pool;
    void* p = pool.allocate(100);
    pool.deallocate(p);
    std::memset(p, 0, 100);  // UAF
}

int main() {
    buggy_function();
    return 0;
}
