#include <iostream>
#include <assert.h>

int func(int param) {
    return 10 / param;
}

int main() {
    std::cout << "line 1" << NULL << std::endl;
    std::cout << (std::string("line 2").compare(std::string("a")) ? "b" : "c") << std::endl;
    int a = 0; assert(a++ || "line 3");

    std::cout << ((long long)"line 4")/0 << std::endl;
    a = a; std::cout << "line 5" + func(0) << std::endl;

    return a-1;
}