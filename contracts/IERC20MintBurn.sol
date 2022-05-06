pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20MintBurn is IERC20 {
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
    function decimals() external view returns (uint8);
}
